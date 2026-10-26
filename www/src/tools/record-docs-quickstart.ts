/**
 * Records the runnable documentation examples through the real Hashbrown clients.
 * Uses deterministic AG-UI output rather than provider credentials. Requires
 * `ngc -p www/examples/quickstart/tsconfig.record.json`, Chromium, and ffmpeg.
 */
import {
  type AGUIEvent,
  EventType,
  type RunAgentInput as HashbrownRunInput,
} from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import express from 'express';

/** Builds a deterministic text run for the locally recorded example. */
function createTextRunEvents(
  input: HashbrownRunInput,
  messageId: string,
  chunks: readonly string[],
): AGUIEvent[] {
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    ...chunks.map((delta): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
    })),
    { type: EventType.TEXT_MESSAGE_END, messageId },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ];
}

const work = resolve('dist/docs-quickstart');
const compiled = resolve(work, 'compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(assets, { recursive: true });

const css = `
*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:20px/1.6 Arial,sans-serif}header{height:116px;padding:28px 72px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center;font-weight:700}.brand{color:#8a571f;font-size:20px}.tag{font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:#786c5e}main{max-width:920px;margin:62px auto}h1{font-size:38px;line-height:1.2;letter-spacing:-1.3px;margin:0 0 28px}h2{font-size:28px;line-height:1.3;margin:0 0 10px}article{margin-top:32px;padding:32px 36px;background:#fff;border:1px solid #dfd8c8;border-radius:18px;box-shadow:0 9px 24px #30282009}article p{margin:0;color:#62574b}button{font:600 17px Arial;border:0;border-radius:12px;padding:17px 24px;background:#fbbb52;color:#302820;cursor:pointer}button:disabled{opacity:.6}label{display:block;font-size:16px;margin-bottom:8px}input{width:100%;font:18px Arial;padding:15px 18px;border:1px solid #cbbfa9;background:#fff;border-radius:10px;margin-bottom:18px}ol{padding-left:25px;font-size:19px}li{padding:8px 0}footer{position:fixed;bottom:0;width:100%;padding:20px 72px;border-top:1px solid #e7dfce;font-size:13px;color:#786c5e;background:#faf9f0;display:flex;justify-content:space-between}pre{padding:32px 42px;margin:38px 72px;background:#fff;border:1px solid #e7dfce;border-radius:18px;font:21px/1.65 monospace;white-space:pre-wrap;color:#40352b}#phase{font-weight:700;color:#40352b}
`;

let failure = false;
const requests: HashbrownRunInput[] = [];
const encoder = new EventEncoder();
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use(express.json());
app.post('/api/chat', async (req, res) => {
  const input = req.body as HashbrownRunInput;
  requests.push(input);
  res.writeHead(200, { 'Content-Type': encoder.getContentType() });
  await new Promise((done) => setTimeout(done, 350));
  if (failure) {
    res.write(
      encoder.encodeSSE({
        type: EventType.RUN_ERROR,
        message: 'Fixture provider is unavailable',
      }),
    );
    res.end();
    return;
  }
  const ui = Boolean(
    (input.forwardedProps as { hashbrown?: { ui?: boolean } })?.hashbrown?.ui,
  );
  const followup =
    input.messages.filter((message) => message.role === 'user').length > 1;
  const text = ui
    ? JSON.stringify({
        ui: [
          {
            WelcomeCard: {
              props: {
                title: 'Welcome to Hashbrown',
                message:
                  'Let’s build something useful with the components you already know.',
              },
            },
          },
        ],
      })
    : followup
      ? 'Your name is Sam.'
      : 'Hi Sam, welcome to Hashbrown!';
  const chunks = text.match(/.{1,12}/gs) ?? [];
  for (const event of createTextRunEvents(
    input,
    `${input.runId}:message`,
    chunks,
  )) {
    res.write(encoder.encodeSSE(event));
    await new Promise((done) =>
      setTimeout(done, event.type === 'TEXT_MESSAGE_CONTENT' ? 75 : 35),
    );
  }
  res.end();
});
const fixture = createServer(app);
await new Promise<void>((done) => fixture.listen(0, '127.0.0.1', done));
const address = fixture.address();
if (!address || typeof address === 'string')
  throw new Error('Missing fixture port');

for (const sdk of ['react', 'angular']) {
  writeFileSync(
    resolve(compiled, `${sdk}.html`),
    `<!doctype html><html><meta charset="utf-8"><title>Hashbrown documentation example</title><body><header><span class="tag">Hashbrown / your first component</span><span class="brand">hashbrown</span></header><div id="root"></div><app-root></app-root><footer><span id="phase">Generate UI with a trusted component</span><span>Scripted response · real Hashbrown runtime · no narration</span></footer><script type="module" src="/${sdk}-entry.js"></script></body></html>`,
  );
}
writeFileSync(
  resolve(compiled, 'react-entry.js'),
  `import React from 'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{App}from'./react/src/App.js';import{Conversation}from'./react/src/Conversation.js';const View=location.search.includes('conversation')?Conversation:App;createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/chat',telemetry:false},React.createElement(View)));`,
);
writeFileSync(
  resolve(compiled, 'angular-entry.js'),
  `import '@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{App}from'./angular/src/app/app.js';import{Conversation}from'./angular/src/app/conversation.js';import{appConfig}from'./angular/src/app/app.config.js';const View=location.search.includes('conversation')?Conversation:App;if(View===Conversation)document.querySelector('app-root').outerHTML='<app-conversation></app-conversation>';bootstrapApplication(View,appConfig).catch(console.error);`,
);

await build({
  configFile: false,
  root: compiled,
  resolve: {
    alias: Object.fromEntries(
      ['core', 'react', 'angular'].map((pkg) => [
        `@hashbrownai/${pkg}`,
        resolve(`dist/packages/${pkg}`),
      ]),
    ),
  },
  build: {
    outDir: resolve(work, 'browser'),
    emptyOutDir: true,
    rollupOptions: {
      input: [
        resolve(compiled, 'react.html'),
        resolve(compiled, 'angular.html'),
      ],
    },
  },
});
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  for (const sdk of ['react', 'angular']) {
    for (const mode of ['welcome-card', 'conversation']) {
      const record =
        sdk === 'react' && process.env['DOCS_SKIP_RECORDING'] !== '1';
      const context = await browser.newContext({
        viewport: { width: 1440, height: 810 },
        ...(record
          ? {
              recordVideo: {
                dir: resolve(work, 'raw'),
                size: { width: 1440, height: 810 },
              },
            }
          : {}),
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${address.port}/${sdk}.html${mode === 'conversation' ? '?conversation' : ''}`,
      );
      await page.addStyleTag({ content: css });
      if (mode === 'conversation') {
        await page.locator('.tag').evaluate((el) => {
          el.textContent = 'Hashbrown / messages and turns';
        });
        await page.locator('#phase').evaluate((el) => {
          el.textContent = 'Keep context between turns';
        });
      }
      const button = page.getByRole('button');
      await expect(button).toBeEnabled();
      await page.waitForTimeout(900);
      const started = Date.now();
      const before = requests.length;
      await button.click();
      await expect(page.getByRole('status')).toBeVisible();
      if (mode === 'welcome-card') {
        await expect(
          page.getByRole('article', { name: 'Welcome card' }),
        ).toBeVisible();
        await expect(
          page.getByText(
            'Let’s build something useful with the components you already know.',
          ),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText('Hi Sam, welcome to Hashbrown!'),
        ).toBeVisible();
        await page.waitForTimeout(1200);
        await page.getByLabel('Your message').fill('What is my name?');
        await page.waitForTimeout(600);
        await button.click();
        await expect(page.getByText('Your name is Sam.')).toBeVisible();
        const second = requests.at(-1);
        if (
          !second?.messages.some(
            (message) =>
              message.role === 'assistant' &&
              message.content === 'Hi Sam, welcome to Hashbrown!',
          )
        )
          throw new Error('Follow-up lost its history');
      }
      await expect(page.getByRole('status')).toHaveCount(0);
      if (mode === 'welcome-card') await expect(button).toBeEnabled();
      await page.waitForTimeout(2500);
      if (record) {
        await expect(
          page.getByText(
            mode === 'welcome-card'
              ? 'Welcome to Hashbrown'
              : 'Your name is Sam.',
            { exact: mode === 'welcome-card' },
          ),
        ).toBeVisible();
        const contentWidth = await page
          .locator('main')
          .evaluate((el) => el.getBoundingClientRect().width);
        if (contentWidth !== 920)
          throw new Error('Presentation styles were lost during capture');
        await page.screenshot({ path: resolve(work, `${mode}-frame.png`) });
        await page
          .locator('main')
          .screenshot({ path: resolve(assets, `${mode}-result.png`) });
      }
      const elapsed = (Date.now() - started) / 1000;
      const video = page.video();
      await context.close();
      if (errors.length)
        throw new Error(`${sdk}/${mode}: ${errors.join('; ')}`);
      if (record && video) {
        const raw = await video.path();
        const output = resolve(assets, mode);
        // Open on the finished result, cut to the real interaction, then hold
        // the result. Source capture stays in dist for future re-edits.
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
              raw,
            ],
            { encoding: 'utf8' },
          ).trim(),
        );
        const offset = Math.max(0, duration - elapsed - 0.5);
        const master = resolve(work, `${mode}-master.mp4`);
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-loop',
            '1',
            '-t',
            '2.5',
            '-i',
            resolve(work, `${mode}-frame.png`),
            '-ss',
            String(offset),
            '-i',
            raw,
            '-filter_complex',
            '[0:v]fps=30,setsar=1[a];[1:v]fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=3[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
            '-map',
            '[v]',
            '-an',
            '-c:v',
            'libx264',
            '-crf',
            '17',
            master,
          ],
          { stdio: 'ignore' },
        );
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-i',
            master,
            '-c:v',
            'libx264',
            '-crf',
            '23',
            '-preset',
            'slow',
            '-movflags',
            '+faststart',
            `${output}.mp4`,
          ],
          { stdio: 'ignore' },
        );
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-i',
            master,
            '-c:v',
            'libvpx-vp9',
            '-crf',
            '32',
            '-b:v',
            '0',
            `${output}.webm`,
          ],
          { stdio: 'ignore' },
        );
        execFileSync(
          'ffmpeg',
          ['-y', '-i', master, '-frames:v', '1', `${output}-poster.png`],
          { stdio: 'ignore' },
        );
      }
      results.push({
        sdk,
        mode,
        requests: requests.length - before,
        passed: true,
      });
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/${sdk}.html`);
    failure = true;
    await page.getByRole('button').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button')).toBeEnabled();
    failure = false;
    await page.getByRole('button').click();
    await expect(
      page.getByRole('article', { name: 'Welcome card' }),
    ).toBeVisible();
    results.push({ sdk, mode: 'error-recovery', passed: true });
    await context.close();
  }
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  fixture.closeAllConnections();
  await new Promise<void>((done, reject) =>
    fixture.close((error) => (error ? reject(error) : done())),
  );
}
