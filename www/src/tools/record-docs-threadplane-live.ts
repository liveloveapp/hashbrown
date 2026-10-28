/** Records genuine installed Threadplane clients with real Hashbrown provider streaming. */
import { chromium, expect, type Page } from '@playwright/test';
import { build as bundle } from 'esbuild';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import {
  buildInstalledThreadplaneConsumer,
  prepareThreadplaneConsumer,
  verifyThreadplaneSourceCheckout,
} from './docs-threadplane-consumers';
import { selectThreadplaneModes } from './docs-threadplane-fixtures';
import {
  threadplaneIncrementalEvidence,
  threadplaneLiveRecordingCues,
  threadplaneLiveSettings,
} from './docs-threadplane-live-recording';

const settings = threadplaneLiveSettings(process.env);
const modes = selectThreadplaneModes(process.env['DOCS_DEMO_MODES']);
const work = resolve('dist/docs-threadplane');
const capture = resolve(
  work,
  'captures',
  new Date().toISOString().replaceAll(':', '-'),
);
const staging = resolve(capture, 'media');
mkdirSync(staging, { recursive: true });
const publicAssets = resolve('www/public/video/docs');
const sdks = ['react', 'angular'] as const;
type Sdk = (typeof sdks)[number];
verifyThreadplaneSourceCheckout();
for (const sdk of sdks) {
  prepareThreadplaneConsumer(sdk);
  await buildInstalledThreadplaneConsumer(sdk);
}
// This presentation layer is built separately. It does not supply aliases,
// framework packages or runtime dependencies to either installed consumer.
await bundle({
  stdin: {
    contents: `import {createThreadplaneCapture,mountThreadplaneWorkbench} from './www/examples/quickstart/runtime/workbench-threadplane';import './www/examples/quickstart/runtime/workbench.css';const sdk=document.documentElement.dataset.sdk;const app=document.querySelector(sdk==='react'?'#root':'app-threadplane-chat');const host=document.createElement('div');document.body.append(host);const capture=createThreadplaneCapture({framework:sdk==='react'?'React':'Angular',origin:location.origin});window.fetch=capture.fetch;const shell=mountThreadplaneWorkbench(host,app,capture);window.__threadplaneWorkbench={store:capture.store,shell};`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: resolve(capture, 'workbench-shell.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  alias: { '@hashbrownai/core': resolve('dist/packages/core') },
});
const serverRoot = resolve(work, 'react');
mkdirSync(resolve(serverRoot, 'server'), { recursive: true });
cpSync(
  resolve('www/examples/threadplane-consumers/server/threadplane-app.ts'),
  resolve(serverRoot, 'server/threadplane-app.ts'),
);
const serverRequire = createRequire(resolve(serverRoot, 'package.json'));
await build({
  configFile: false,
  root: serverRoot,
  ssr: { noExternal: ['@hashbrownai/openai', '@hashbrownai/core'] },
  build: {
    ssr: resolve(serverRoot, 'server/threadplane-app.ts'),
    outDir: resolve(serverRoot, 'server-live-dist'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'threadplane-app.mjs' } },
  },
});
const { createThreadplaneApp } = await import(
  pathToFileURL(resolve(serverRoot, 'server-live-dist/threadplane-app.mjs'))
    .href
);
const evidence = {
  source: 'real-provider',
  model: settings.model,
  timingScale: 1,
  installations: sdks.map((sdk) => {
    const root = resolve(work, sdk),
      installed = createRequire(resolve(root, 'package.json'));
    const framework = sdk === 'react' ? 'react' : '@angular/core';
    return {
      sdk,
      framework: installed.resolve(framework),
      lockSha256: createHash('sha256')
        .update(readFileSync(resolve(root, 'package-lock.json')))
        .digest('hex'),
    };
  }),
  serverAdapter: serverRequire.resolve('@hashbrownai/openai'),
};
writeFileSync(
  resolve(capture, 'provenance.json'),
  JSON.stringify(evidence, null, 2),
);
const servers: ReturnType<typeof createServer>[] = [];
const origins = {} as Record<Sdk, string>;
const requests: {
  sdk: Sdk;
  input: {
    threadId: string;
    runId: string;
    messages: { id: string; role: string; content: unknown }[];
  };
  output: string[];
}[] = [];
const styles = `@font-face{font-family:'Hanken Grotesk';src:url('/fonts/HankenGrotesk-Regular.ttf')}@font-face{font-family:'Hanken Grotesk';font-weight:600;src:url('/fonts/HankenGrotesk-SemiBold.ttf')}@font-face{font-family:'JetBrains Mono';src:url('/fonts/JetBrainsMono-Regular.ttf')}body{margin:0;padding:0}.wb{width:100%;max-width:none;margin:0}body>div>.wb-root main{margin:0;width:auto} .wb-threadplane-app{min-width:0;min-height:0;height:100%}.wb-threadplane-app main{width:100%;margin:0;padding:0;max-width:none}.wb-threadplane-app h1{display:none}.wb-threadplane-app .tp-chat{display:flex;flex-direction:column;height:100%;gap:16px}.wb-threadplane-app .tp-chat>section{flex:1;overflow:auto;min-height:0}.wb-threadplane-app .tp-chat-input{flex:none}.wb-threadplane-app chat{height:100%!important;max-height:none!important;border:0}.wb-threadplane-app app-threadplane-chat{height:100%;display:block}.wb-threadplane-app app-threadplane-chat main{height:100%}.wb-threadplane-app #root{height:100%}.wb-threadplane-app{--tp-color-primary:#0d0d0d;--tp-color-background:#fff}.wb-feed:has(.wb-threadplane-app){padding:18px}.wb-threadplane-app textarea{font:inherit}.wb-threadplane-app .tp-chat-input__send,.wb-threadplane-app .tp-chat-input__stop{background:var(--wb-ink,#0d0d0d);color:#fff;border-radius:8px;padding:8px 14px;border:0}.wb-threadplane-app .tp-chat-input{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:12px}.wb-threadplane-app .tp-chat-input__textarea{width:100%;resize:vertical;min-height:60px;border:0;background:transparent}.wb-threadplane-app .tp-chat-input__label{font-size:12px}.wb-threadplane-app [role=status]{font-size:12px;color:#52525b}.wb-threadplane-app li{overflow-wrap:anywhere}`;
for (const sdk of sdks) {
  const app = express();
  app.get('/', (_req, res) => {
    let html = readFileSync(resolve(work, sdk, 'dist/index.html'), 'utf8');
    html = html
      .replace('<html ', `<html data-sdk="${sdk}" `)
      .replace(
        '</head>',
        '<link rel="stylesheet" href="/workbench-shell.css"><style>' +
          styles +
          '</style></head>',
      )
      .replace('</body>', '<script src="/workbench-shell.js"></script></body>');
    res.type('html').send(html);
  });
  app.get('/workbench-shell.js', (_req, res) =>
    res.sendFile(resolve(capture, 'workbench-shell.js')),
  );
  app.get('/workbench-shell.css', (_req, res) =>
    res.sendFile(resolve(capture, 'workbench-shell.css')),
  );
  app.use('/fonts', express.static(resolve('www/src/lib/og/fonts')));
  app.use(express.static(resolve(work, sdk, 'dist')));
  app.use('/media', express.static(staging));
  app.post('/api/chat', express.json({ limit: '64kb' }), (req, res, next) => {
    const request = { sdk, input: req.body, output: [] as string[] };
    const write = res.write.bind(res);
    res.write = ((chunk: string | Buffer, ...args: unknown[]) => {
      request.output.push(chunk.toString());
      return Reflect.apply(write, res, [chunk, ...args]);
    }) as typeof res.write;
    requests.push(request);
    res.setHeader('X-Workbench-Source', 'provider');
    next();
  });
  app.use(
    createThreadplaneApp({ apiKey: settings.apiKey, model: settings.model }),
  );
  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No consumer address');
  origins[sdk] = `http://127.0.0.1:${address.port}`;
}
const firstPrompt = 'Create a two-step plan for a trusted UI demo.';
const secondPrompt =
  'Make the second step shorter. Keep the title and first step exactly the same.';
const composer = (page: Page, sdk: Sdk) =>
  page.getByRole('textbox', {
    name: sdk === 'react' ? 'Your message' : 'Type a message',
    exact: true,
  });
const send = (page: Page, sdk: Sdk) =>
  page.getByRole('button', {
    name: sdk === 'react' ? 'Send' : 'Send message',
    exact: true,
  });
const snapshot = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __threadplaneWorkbench: {
          store: {
            getSnapshot(): {
              status: string;
              cursor: number | null;
              application: unknown;
              events: {
                kind: string;
                payload: unknown;
                turn: number;
                json: string;
                messages: { role: string; content: string }[];
              }[];
              frame: {
                json: string;
                messages: { role: string; content: string }[];
              } | null;
            };
          };
        };
      }
    ).__threadplaneWorkbench.store.getSnapshot(),
  );
async function demonstrate(page: Page, sdk: Sdk) {
  const started = Date.now(),
    phases: Record<string, number> = {};
  const phase = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = requests.length;
  await page.addInitScript((framework) => {
    const samples: { turn: number; text: string }[] = [];
    (
      window as unknown as { __threadplaneDomSamples: typeof samples }
    ).__threadplaneDomSamples = samples;
    new MutationObserver(() => {
      const messages =
        framework === 'react'
          ? [
              ...document.querySelectorAll(
                '.wb-threadplane-app section[aria-label="Conversation"] li',
              ),
            ]
              .filter(
                (row) => row.querySelector('span')?.textContent === 'Assistant',
              )
              .map((row) => row.querySelector('p'))
          : [
              ...document.querySelectorAll(
                '.wb-threadplane-app chat-message[data-role="assistant"]',
              ),
            ];
      const text =
        (messages.at(-1) as HTMLElement | undefined)?.innerText ?? '';
      if (text && samples.length < 1000 && samples.at(-1)?.text !== text)
        samples.push({ turn: messages.length, text });
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, sdk);
  await page.goto(origins[sdk]);
  await expect(composer(page, sdk)).toBeVisible();
  await page.waitForTimeout(1800);
  expect(requests.length).toBe(before);
  await composer(page, sdk).fill(firstPrompt);
  await send(page, sdk).click();
  await expect
    .poll(async () => (await snapshot(page)).status, { timeout: 90000 })
    .toBe('complete');
  await expect(send(page, sdk)).toBeVisible();
  const first = await snapshot(page);
  const firstText =
    first.frame?.messages.filter((m) => m.role === 'assistant').at(-1)
      ?.content ?? '';
  expect(firstText).toMatch(/1[.)][\s\S]*2[.)]/);
  const firstStreaming = threadplaneIncrementalEvidence(first.events, 1);
  await page.waitForTimeout(2600);
  phase('firstComplete');
  await composer(page, sdk).fill(secondPrompt);
  await page.waitForTimeout(2300);
  phase('followup');
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await send(page, sdk).click();
  await expect.poll(() => requests.length, { timeout: 90000 }).toBe(before + 2);
  await expect
    .poll(async () => (await snapshot(page)).status, { timeout: 90000 })
    .toBe('complete');
  const final = await snapshot(page);
  const secondStreaming = threadplaneIncrementalEvidence(final.events, 2);
  const secondText =
    final.frame?.messages.filter((m) => m.role === 'assistant').at(-1)
      ?.content ?? '';
  const parts = (text: string) =>
    text
      .replaceAll('**', '')
      .trim()
      .split(/\n?\s*[12][.)]\s+/)
      .map((part) => part.trim());
  const a = parts(firstText),
    b = parts(secondText);
  expect(b).toHaveLength(3);
  expect(a).toHaveLength(3);
  expect(b[0]).toBe(a[0]);
  expect(b[1]).toBe(a[1]);
  expect(b[2].length).toBeLessThan(a[2].length);
  expect(requests.length).toBe(before + 2);
  const [request1, request2] = requests.slice(before);
  expect(request2.input.threadId).toBe(request1.input.threadId);
  expect(request2.input.runId).not.toBe(request1.input.runId);
  expect(
    request2.input.messages
      .filter((m) => ['user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: m.content })),
  ).toEqual([
    { role: 'user', content: firstPrompt },
    { role: 'assistant', content: firstText },
    { role: 'user', content: secondPrompt },
  ]);
  await page.waitForTimeout(2600);
  phase('secondComplete');
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.waitForTimeout(2300);
  await page.getByRole('tab', { name: 'Requests', exact: true }).click();
  await page.waitForTimeout(2300);
  phase('inspected');
  await page.getByRole('tab', { name: 'State', exact: true }).click();
  await page.waitForTimeout(2600);
  phase('replay');
  const domSamples = await page.evaluate(
    () =>
      (
        window as unknown as {
          __threadplaneDomSamples: { turn: number; text: string }[];
        }
      ).__threadplaneDomSamples,
  );
  const normalizeText = (text: string) =>
    text
      .replace(/\b[12][.)]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const domStreaming = [firstText, secondText].map((text, index) => {
    const normalized = normalizeText(text);
    const partials = domSamples
      .filter((sample) => sample.turn === index + 1)
      .map((sample) => normalizeText(sample.text))
      .filter(
        (partial) =>
          partial.length >= 10 &&
          partial.length < normalized.length - 5 &&
          normalized.startsWith(partial),
      );
    expect(partials.length).toBeGreaterThan(0);
    return { turn: index + 1, partials: partials.length };
  });
  const stable = await snapshot(page);
  const timeline = page.locator('[data-index]');
  await timeline.first().click();
  await page.waitForTimeout(2100);
  await page.getByRole('button', { name: /^Play$/ }).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /Return to live/ }).click();
  expect(requests.length).toBe(before + 2);
  expect((await snapshot(page)).application).toEqual(stable.application);
  expect((await snapshot(page)).events).toEqual(stable.events);
  expect(errors).toEqual([]);
  phase('returnedLive');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: resolve(capture, `${sdk}-result.png`) });
  const report = {
    sdk,
    phases,
    firstText,
    secondText,
    requests: 2,
    incremental: [firstStreaming, secondStreaming],
    domStreaming,
    replayRequests: 0,
    unchangedState: true,
    application: final.application,
  };
  writeFileSync(
    resolve(capture, `${sdk}-report.json`),
    JSON.stringify(report, null, 2),
  );
  return report;
}
const browser = await chromium.launch();
const results: Awaited<ReturnType<typeof demonstrate>>[] = [];
try {
  // Both framework recordings remain staged until both real conversations pass.
  for (const mode of modes) {
    const sdk: Sdk = mode === 'threadplane-react' ? 'react' : 'angular';
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      ...(settings.record
        ? {
            recordVideo: {
              dir: resolve(capture, 'raw'),
              size: { width: 1600, height: 1000 },
            },
          }
        : {}),
    });
    const page = await context.newPage();
    try {
      const report = await demonstrate(page, sdk);
      results.push(report);
      const video = page.video();
      await context.close();
      if (!settings.record) continue;
      if (!video) throw new Error('No actual recording');
      const raw = await video.path(),
        id = `canonical-workbench-threadplane-${sdk}`;
      for (const [extension, codec] of [
        [
          'mp4',
          [
            '-c:v',
            'libx264',
            '-crf',
            '23',
            '-preset',
            'fast',
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
            '-row-mt',
            '1',
          ],
        ],
      ] as const)
        execFileSync(
          'ffmpeg',
          [
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
            resolve(staging, `${id}.${extension}`),
          ],
          { stdio: 'inherit' },
        );
      const duration = Number(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'csv=p=0',
            resolve(staging, `${id}.mp4`),
          ],
          { encoding: 'utf8' },
        ).trim(),
      );
      const cues = threadplaneLiveRecordingCues(report.phases, duration);
      const stamp = (s: number) =>
        new Date(s * 1000).toISOString().slice(11, 23);
      writeFileSync(
        resolve(staging, `${id}.vtt`),
        'WEBVTT\n\n' +
          cues
            .map(
              ([from, to, text]) =>
                `${stamp(from)} --> ${stamp(to)}\n${text}\n`,
            )
            .join('\n'),
      );
      cpSync(
        resolve(capture, `${sdk}-result.png`),
        resolve(staging, `${id}-result.png`),
      );
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(report.phases.firstComplete),
        '-i',
        resolve(staging, `${id}.mp4`),
        '-frames:v',
        '1',
        resolve(staging, `${id}-poster.png`),
      ]);
      writeFileSync(
        resolve(staging, `${id}-transcript.txt`),
        `${sdk.toUpperCase()} · Threadplane\n\nActual separately installed Threadplane ${sdk} presentation with the real Hashbrown OpenAI server adapter and real provider output. ${sdk === 'react' ? 'Hashbrown useChat owns execution; TextTranscript and ChatInput present text.' : 'Threadplane AG-UI owns frontend execution; ChatComponent displays the response.'} The optional canonical shell observes actual requests and decoded protocol events without rewriting response bytes. Actual-speed footage with reading pauses; no narration, fixture answers or invented tokens. No structured plan or generated component is claimed.\n\n${cues.map(([, , text]) => text).join('\n\n')}\n\nApplication state remains at revision zero. Replay uses captured text and makes no requests or writes. Refresh clears these local captures.\n`,
      );
      console.log(
        JSON.stringify({ sdk, duration, cues: cues.length, capture }),
      );
    } catch (error) {
      if (!page.isClosed()) {
        await page.screenshot({ path: resolve(capture, `${sdk}-failure.png`) });
        writeFileSync(
          resolve(capture, `${sdk}-failure.txt`),
          await page.locator('body').innerText(),
        );
        writeFileSync(
          resolve(capture, `${sdk}-failure.json`),
          JSON.stringify({ snapshot: await snapshot(page), requests }, null, 2),
        );
        await context.close();
      }
      throw error;
    }
  }
  writeFileSync(
    resolve(capture, 'requests.json'),
    JSON.stringify(requests, null, 2),
  );
  writeFileSync(
    resolve(capture, 'verification.json'),
    JSON.stringify({ ...evidence, results }, null, 2),
  );
  if (settings.record)
    for (const file of (await import('node:fs')).readdirSync(staging))
      cpSync(resolve(staging, file), resolve(publicAssets, file));
  console.log(JSON.stringify({ capture, results, published: settings.record }));
} finally {
  await browser.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
