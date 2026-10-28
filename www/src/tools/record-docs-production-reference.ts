/** Records both real framework clients across a Postgres-backed server process replacement. */
import { chromium, expect } from '@playwright/test';
import { createPostgresPool } from '@b4run/postgres-storage/node';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  saveWorkbenchCapture,
  stageWorkbenchCaptures,
} from './workbench-capture-file';
import { publishWorkbenchMedia } from './workbench-media-publication';
import {
  productionRecordingCues,
  verifyProductionRecording,
} from './workbench-production-recording';

if (
  !process.env['OPENAI_API_KEY'] ||
  !process.env['OPENAI_MODEL'] ||
  !process.env['PRODUCTION_DATABASE_URL']
)
  throw new Error(
    'Recording requires a server OpenAI key/model and an isolated reference Postgres database.',
  );
const origin = process.env['PRODUCTION_ORIGIN'] ?? 'http://127.0.0.1:4372';
const work = resolve(
  'dist/docs-production-reference/captures',
  new Date().toISOString().replaceAll(':', '-'),
);
const staging = resolve(work, 'media');
mkdirSync(staging, { recursive: true });
const env = {
  ...process.env,
  PRODUCTION_ORIGIN: origin,
  PORT: new URL(origin).port,
  PRODUCTION_COOKIE_SECRET:
    process.env['PRODUCTION_COOKIE_SECRET'] ??
    'recording-only-shared-secret-at-least-32-characters',
};
let server: ChildProcess | undefined;
const stop = async () => {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  await exited;
};
const start = async () => {
  server = spawn(
    process.execPath,
    ['--import', 'tsx', 'www/examples/quickstart/server/production/host.ts'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  server.stdout?.on('data', (data) => {
    log += String(data);
  });
  server.stderr?.on('data', (data) => {
    log += String(data);
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Reference server exited: ${log}`);
    try {
      if (
        log.includes('Production reference listening') &&
        (await fetch(`${origin}/react.html`)).ok
      ) {
        if (!server.pid) throw new Error('Reference process has no identity.');
        return server.pid;
      }
    } catch {
      /* Wait for this owned child process to listen. */
    }
    await delay(200);
  }
  throw new Error(`Reference did not become ready: ${log}`);
};
const pool = createPostgresPool({
  connectionString: process.env['PRODUCTION_DATABASE_URL'],
  max: 2,
});
const browser = await chromium.launch({ headless: true });
const ids: string[] = [];
const reports: unknown[] = [];
try {
  let pid = await start();
  for (const framework of ['react', 'angular'] as const) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      recordVideo: { dir: work, size: { width: 1600, height: 1000 } },
    });
    const page = await context.newPage();
    const phases: Record<string, number> = {};
    let runRequests = 0;
    const errors: string[] = [];
    const runs: { input: unknown; output?: string }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/production/run'
      ) {
        runRequests++;
        runs.push({ input: request.postDataJSON() });
      }
    });
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/production/run') {
        const run = runs.at(-1);
        void response
          .text()
          .then((output) => {
            if (run) run.output = output;
            writeFileSync(
              resolve(work, `${framework}-native-runs.json`),
              JSON.stringify(runs, null, 2),
            );
          })
          .catch(() => undefined);
      }
    });
    const started = performance.now();
    const mark = async (name: string, hold = 3500) => {
      await delay(hold);
      phases[name] = (performance.now() - started) / 1000;
      console.log(`${framework}: ${name}`);
    };
    try {
      await page.goto(`${origin}/${framework}.html?lesson=production-recovery`);
      await page
        .getByRole('button', { name: 'Create server thread', exact: true })
        .click();
      const thread = page.getByRole('textbox', {
        name: 'Thread ID',
        exact: true,
      });
      await expect(thread).not.toHaveValue('', { timeout: 30_000 });
      const threadId = await thread.inputValue();
      await page
        .getByRole('button', { name: 'Read and restore recovery', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Send', exact: true }),
      ).toBeEnabled();
      await page
        .getByRole('textbox', { name: 'Your message', exact: true })
        .fill(
          'Propose the fixed recording plan using acceptPlan. The runtime will ask for my approval.',
        );
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Approve plan', exact: true }),
      ).toBeEnabled({ timeout: 90_000 });
      await mark('paused');
      const initialProcessId = pid;
      await stop();
      pid = await start();
      await mark('restarted');
      const runRequestsBeforeRestore = runRequests;
      await page.reload();
      await expect(
        page.getByRole('textbox', { name: 'Thread ID', exact: true }),
      ).toHaveValue(threadId);
      const recoveryResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/threads/${threadId}/recovery`) &&
          response.request().method() === 'GET',
      );
      await page
        .getByRole('button', { name: 'Read and restore recovery', exact: true })
        .click();
      const recovery = await (await recoveryResponse).json();
      await expect(
        page.getByRole('button', { name: 'Approve plan', exact: true }),
      ).toBeEnabled();
      expect(recovery.application.revision).toBe(0);
      expect(recovery.snapshot.interrupts).toHaveLength(1);
      await mark('restored');
      const runRequestsAfterRestore = runRequests;
      await page
        .getByRole('button', { name: 'Approve plan', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Read application receipt',
          exact: true,
        }),
      ).toBeEnabled({ timeout: 90_000 });
      const receiptResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/threads/${threadId}/recovery`) &&
          response.request().method() === 'GET',
      );
      await page
        .getByRole('button', { name: 'Read application receipt', exact: true })
        .click();
      const application = (await (await receiptResponse).json()).application;
      expect(application.revision).toBe(1);
      await expect(
        page
          .getByRole('region', { name: 'Conversation', exact: true })
          .getByText('Outline the demo', { exact: true }),
      ).toBeVisible();
      await mark('approved');
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await mark('replay');
      const runRequestsBeforeReplay = runRequests;
      await page.getByRole('slider', { name: 'Seek captured event' }).focus();
      await page.keyboard.press('Home');
      await page
        .getByRole('button', { name: 'Next event', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Create server thread', exact: true }),
      ).toBeDisabled();
      await mark('returnedLive');
      await page
        .getByRole('button', { name: 'Return to live', exact: true })
        .click();
      await delay(3500);
      const receipts = Number(
        (
          await pool.query<{ count: string }>(
            'SELECT count(*) FROM hashbrown_production.application_receipts WHERE thread_id = $1',
            [threadId],
          )
        ).rows[0].count,
      );
      const evidence = {
        source: 'b4run-postgres-openai',
        initialProcessId,
        replacementProcessId: pid,
        runRequestsBeforeRestore,
        runRequestsAfterRestore,
        runRequestsBeforeReplay,
        runRequestsAfterReplay: runRequests,
        revision: application.revision,
        receipts,
        restoredInterrupts: recovery.snapshot.interrupts.length,
      };
      verifyProductionRecording(evidence);
      expect(errors).toEqual([]);
      const id = `canonical-workbench-production-recovery-${framework}`;
      const base = resolve(staging, id);
      // Saved while the workbench is still mounted; staged once both pass.
      await saveWorkbenchCapture(
        page,
        resolve(work, `${framework}-production-recovery-live.capture.json`),
      );
      await page.screenshot({ path: `${base}-result.png` });
      const video = page.video();
      await context.close();
      if (!video) throw new Error('No real browser recording.');
      const raw = await video.path();
      for (const [extension, codec] of [
        [
          'mp4',
          [
            '-c:v',
            'libx264',
            '-crf',
            '22',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
          ],
        ],
        [
          'webm',
          [
            '-c:v',
            'libvpx-vp9',
            '-crf',
            '32',
            '-b:v',
            '0',
            '-cpu-used',
            '4',
            '-threads',
            '4',
            '-row-mt',
            '1',
          ],
        ],
      ] as const)
        execFileSync('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          raw,
          '-r',
          '30',
          '-an',
          ...codec,
          `${base}.${extension}`,
        ]);
      const duration = Number(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            `${base}.mp4`,
          ],
          { encoding: 'utf8' },
        ).trim(),
      );
      const cues = productionRecordingCues(phases, duration);
      const stamp = (seconds: number) =>
        new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
      writeFileSync(
        `${base}.vtt`,
        `WEBVTT\n\n${cues.map(([from, to, text], index) => `${index + 1}\n${stamp(from)} --> ${stamp(to)}\n${text}\n`).join('\n')}`,
      );
      writeFileSync(
        `${base}-transcript.txt`,
        `${framework.toUpperCase()} · Durable recovery with b4.run\n\nReal OpenAI output through Hashbrown and b4.run 0.15.5, backed by isolated Postgres. Actual-speed footage with reading pauses; no narration. A genuine server process replacement preserves the paused checkpoint and approval grant. Explicit restoration sends no model request. Explicit approval commits one application plan revision and receipt. This protects the illustrated database write; it does not guarantee exactly-once external effects. The local identity is a signed anonymous cookie, not account login.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nPlayback sends no requests and writes no application state. The post-refresh timeline contains newly observed recovery and resume facts; it does not reconstruct the original stream's timing.\n`,
      );
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(Math.min(duration - 0.1, phases['approved'])),
        '-i',
        `${base}.mp4`,
        '-frames:v',
        '1',
        `${base}-poster.png`,
      ]);
      ids.push(id);
      reports.push({ framework, threadId, phases, duration, ...evidence });
      writeFileSync(
        resolve(work, 'report.json'),
        JSON.stringify(reports, null, 2),
      );
    } catch (error) {
      await page
        .screenshot({ path: resolve(work, `${framework}-failure.png`) })
        .catch(() => undefined);
      await context.close().catch(() => undefined);
      throw error;
    }
  }
  if (ids.length !== 2)
    throw new Error('Both frameworks must pass before publication.');
  // Captures are stamped with the commit the media is published from.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  stageWorkbenchCaptures(
    work,
    staging,
    (['react', 'angular'] as const).map((framework) => ({
      id: `canonical-workbench-production-recovery-${framework}`,
      framework,
      lesson: 'production-recovery',
    })),
    commit,
  );
  publishWorkbenchMedia(staging, resolve('www/public/video/docs'), ids);
  copyFileSync(
    resolve(work, 'report.json'),
    resolve(work, 'published-report.json'),
  );
  console.log(
    `Published ${ids.length} verified production-reference recordings. Evidence: ${work}`,
  );
} finally {
  await browser.close();
  await stop();
  await pool.end();
}
