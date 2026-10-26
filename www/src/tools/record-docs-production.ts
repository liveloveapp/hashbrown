/** Records actual endpoint, server-thread, and QuickJS interactions for the docs. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import { createThreadApp } from '../../examples/quickstart/server/thread-app';
import { createMemoryThreadStore } from '../../examples/quickstart/server/thread-store';

const modes = [
  'public-endpoint',
  'server-threads',
  'javascript-runtime',
] as const;
type Mode = (typeof modes)[number];
const requested = process.env['DOCS_DEMO_MODES']?.split(',');
if (requested?.some((mode) => !modes.includes(mode as Mode)))
  throw new Error('Unknown production demo mode');
const selected = modes.filter((mode) => !requested || requested.includes(mode));
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-production');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(work, { recursive: true });
mkdirSync(assets, { recursive: true });
const css = `*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:16px/1.4 Arial,sans-serif}header{height:88px;padding:24px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center}.brand{font-size:22px;font-weight:700;color:#8a571f}.tag{font-size:12px;letter-spacing:1.3px;text-transform:uppercase}main{width:1000px;margin:18px auto}h1{font-size:29px;margin:0 0 12px;line-height:1.2}h2{font-size:19px;margin:10px 0 6px}p{margin:7px 0}nav{display:flex;gap:6px;margin:10px 0}button{font:600 14px Arial;padding:10px 14px;border:0;border-radius:9px;background:#fbbb52;color:#302820;cursor:pointer;margin:0 6px 4px 0}button:disabled{opacity:.6}label{display:block;font-size:13px;margin:6px 0 4px}input,select,textarea{font:15px/1.4 Arial,sans-serif;padding:9px 12px;border:1px solid #cbbfa9;background:white;border-radius:9px;margin-bottom:7px}input,textarea{width:100%}select{min-width:180px}textarea{height:132px;resize:none;font:14px/1.35 monospace}pre{font:14px/1.4 monospace;margin:6px 0 10px;padding:14px 18px;border:1px solid #dfd8c8;border-radius:12px;background:white;white-space:pre-wrap;max-height:142px;overflow:auto}ol{margin:10px 0;padding-left:24px}li{padding:3px 0}footer{position:fixed;bottom:0;width:100%;padding:16px 64px;border-top:1px solid #e7dfce;background:#faf9f0;color:#786c5e;font-size:12px;display:flex;justify-content:space-between}[role=alert]{color:#8b3c24}#endpoint-status{font-size:24px;font-weight:700;margin:16px 0}`;
const descriptions: Record<Mode, string> = {
  'public-endpoint': 'Verify identity and ownership before streaming',
  'server-threads': 'Load, save, and reload versioned text from the server',
  'javascript-runtime':
    'Run actual QuickJS with an explicitly validated host function',
};
for (const sdk of ['react', 'angular']) {
  writeFileSync(
    resolve(compiled, `${sdk}.html`),
    `<!doctype html><html><meta charset="utf-8"><title>Hashbrown production example</title><style>${css}</style><body><header><span class="tag">Hashbrown / application boundaries</span><span class="brand">hashbrown</span></header><div id="root"></div><app-root></app-root><footer><span id="phase"></span><span id="disclosure"></span></footer><script type="module" src="/${sdk}-production-entry.js"></script></body></html>`,
  );
  const frame = `const mode=new URLSearchParams(location.search).get('mode')??'server-threads';document.querySelector('#phase').textContent=${JSON.stringify(descriptions)}[mode];document.querySelector('#disclosure').textContent=mode==='javascript-runtime'?'Real QuickJS execution · prewritten scripts · no narration':'Local fixture session · in-memory store · scripted provider · no narration';`;
  const endpoint = `if(mode==='public-endpoint'){document.querySelector('#root').innerHTML=\`<main><h1>Check access before starting a reply</h1><p>Try the endpoint without a session, then use a local demo session.</p><button id="check">Check endpoint</button><button id="login">Start demo session</button><button id="foreign">Try another owner’s thread</button><div role="status" id="endpoint-status">Ready to check access</div><h2>Response</h2><pre id="endpoint-response">No request sent.</pre><p>Identity, ownership, and request limits are checked on the server before provider work.</p></main>\`;const run=async(threadId)=>{document.querySelector('#endpoint-status').textContent='Checking endpoint...';document.querySelector('#endpoint-response').textContent='Waiting for the response...';const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId,runId:crypto.randomUUID(),messages:[{id:'question',role:'user',content:'My name is Sam. Say hello.'}],tools:[],context:[],state:{},forwardedProps:{}})});document.querySelector('#endpoint-status').textContent='HTTP '+response.status;const text=await response.text();document.querySelector('#endpoint-response').textContent=text.includes('RUN_FINISHED')?(()=>{const events=text.split('\\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)));const reply=events.filter(event=>event.type==='TEXT_MESSAGE_CONTENT').map(event=>event.delta).join('');return events[0].type+' → streamed reply → '+events.at(-1).type+'\\n'+reply;})():text;};document.querySelector('#check').onclick=()=>run('personal');document.querySelector('#foreign').onclick=()=>run('private');document.querySelector('#login').onclick=async()=>{await fetch('/api/demo/session',{method:'POST'});document.querySelector('#endpoint-status').textContent='Local demo session ready';};}else`;
  if (sdk === 'react')
    writeFileSync(
      resolve(compiled, `${sdk}-production-entry.js`),
      `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{ServerConversations}from'./react/src/ServerConversations.js';import{RuntimeDemo}from'./react/src/RuntimeDemo.js';${frame}${endpoint}{const View=mode==='javascript-runtime'?RuntimeDemo:ServerConversations;createRoot(document.querySelector('#root')).render(React.createElement(HashbrownProvider,{url:'/api/chat',telemetry:false},React.createElement(View)));}`,
    );
  else
    writeFileSync(
      resolve(compiled, `${sdk}-production-entry.js`),
      `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{ServerConversations}from'./angular/src/app/server-conversations.js';import{RuntimeDemo}from'./angular/src/app/runtime-demo.js';${frame}${endpoint}{const runtime=mode==='javascript-runtime';document.querySelector('app-root').outerHTML=runtime?'<app-runtime-demo></app-runtime-demo>':'<app-server-conversations></app-server-conversations>';bootstrapApplication(runtime?RuntimeDemo:ServerConversations,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/chat',telemetry:false})]}).catch(console.error);}`,
    );
}
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
      input: ['react', 'angular'].map((sdk) =>
        resolve(compiled, `${sdk}.html`),
      ),
    },
  },
});
const outer = express();
outer.use(express.static(resolve(work, 'browser')));
const server = createServer(outer);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing recorder port');
const origin = `http://127.0.0.1:${address.port}`;
const seed = () =>
  createMemoryThreadStore([
    { ownerId: 'sam', id: 'personal', messages: [] },
    { ownerId: 'sam', id: 'work', messages: [] },
    { ownerId: 'lee', id: 'private', messages: [] },
  ]);
let store = seed();
const sessions = new Set<string>();
const requests: RunAgentInput[] = [];
outer.post('/api/demo/session', (req, res) => {
  if (req.get('origin') !== origin) {
    res.status(403).end();
    return;
  }
  const token = randomUUID();
  sessions.add(token);
  res
    .cookie('docs_session', token, { httpOnly: true, sameSite: 'strict' })
    .json({ ready: true });
});
outer.use(
  createThreadApp({
    origin,
    authenticate: async (req) => {
      const token = req
        .get('cookie')
        ?.split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith('docs_session='))
        ?.slice('docs_session='.length);
      return token && sessions.has(token) ? 'sam' : null;
    },
    allowRun: async () => true,
    store: {
      read: (owner, id) => store.read(owner, id),
      compareAndSwap: (owner, id, version, messages) =>
        store.compareAndSwap(owner, id, version, messages),
    },
    stream: async function* (input): AsyncGenerator<AGUIEvent> {
      requests.push(input);
      const users = input.messages.filter((message) => message.role === 'user');
      const name =
        users
          .map((message) =>
            typeof message.content === 'string'
              ? message.content.match(/My name is (\w+)/i)?.[1]
              : undefined,
          )
          .find(Boolean) ?? 'friend';
      const text =
        users.length > 1
          ? `Your name is ${name}.`
          : `Hi ${name}, welcome to Hashbrown!`;
      const messageId = `${input.runId}:answer`;
      yield {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      };
      yield {
        type: EventType.TEXT_MESSAGE_START,
        role: 'assistant',
        messageId,
      };
      for (const delta of text.match(/.{1,8}/gs) ?? []) {
        await new Promise((done) => setTimeout(done, 110));
        yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta };
      }
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      };
    },
  }),
);

/** Crops a static full-frame capture without disturbing the browser screencast. */
function crop(
  source: string,
  target: string,
  bounds: { width: number; height: number; x: number; y: number },
) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      source,
      '-vf',
      `crop=${[bounds.width, bounds.height, bounds.x, bounds.y].map(Math.round).join(':')}`,
      target,
    ],
    { stdio: 'ignore' },
  );
}
/** Encodes the complete capture after a short result preview. */
function encode(mode: Mode, raw: string) {
  const master = resolve(work, `${mode}-master.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-t',
      '2',
      '-i',
      resolve(work, `${mode}-frame.png`),
      '-i',
      raw,
      '-filter_complex',
      '[0:v]fps=30,setpts=PTS-STARTPTS,setsar=1[a];[1:v]fps=30,setpts=PTS-STARTPTS,setsar=1,tpad=stop_mode=clone:stop_duration=1[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
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
      resolve(assets, `${mode}.mp4`),
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
      '-cpu-used',
      '4',
      '-row-mt',
      '1',
      resolve(assets, `${mode}.webm`),
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      master,
      '-frames:v',
      '1',
      resolve(assets, `${mode}-poster.png`),
    ],
    { stdio: 'ignore' },
  );
}
async function login(page: Page) {
  await page.request.post(`${origin}/api/demo/session`, {
    headers: { Origin: origin },
  });
}
async function send(page: Page, prompt: string) {
  await page.getByLabel('Your message', { exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}
async function runtimeRun(page: Page) {
  await page
    .getByRole('button', { name: 'Run in sandbox', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Run in sandbox', exact: true }),
  ).toBeEnabled({ timeout: 10000 });
}
async function exercise(page: Page, mode: Mode, capture: boolean) {
  if (mode === 'public-endpoint') {
    await page
      .getByRole('button', { name: 'Check endpoint', exact: true })
      .click();
    await expect(page.locator('#endpoint-status')).toHaveText('HTTP 401');
    await page.waitForTimeout(800);
    await page
      .getByRole('button', { name: 'Start demo session', exact: true })
      .click();
    await expect(page.locator('#endpoint-status')).toHaveText(
      'Local demo session ready',
    );
    await page
      .getByRole('button', { name: 'Try another owner’s thread', exact: true })
      .click();
    await expect(page.locator('#endpoint-status')).toHaveText('HTTP 404');
    await page.waitForTimeout(800);
    await page
      .getByRole('button', { name: 'Check endpoint', exact: true })
      .click();
    await expect(page.locator('#endpoint-response')).toContainText(
      'RUN_FINISHED',
    );
    await expect(page.locator('#endpoint-status')).toHaveText('HTTP 200');
  } else if (mode === 'server-threads') {
    await expect(
      page.getByText('Saved on the server', { exact: true }),
    ).toBeVisible();
    await send(page, 'My name is Sam. Say hello in one sentence.');
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    await expect(
      page.getByText('Saved on the server', { exact: true }),
    ).toBeVisible();
    const beforeReload = requests.length;
    const savedVersion = (await store.read('sam', 'personal'))?.version;
    await page.reload();
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    await page.waitForTimeout(650);
    expect(requests.length).toBe(beforeReload);
    expect((await store.read('sam', 'personal'))?.version).toBe(savedVersion);
    await page
      .getByRole('combobox', { name: 'Conversation', exact: true })
      .selectOption('work');
    await expect(page.getByLabel('Your message')).toBeVisible();
    await send(page, 'My name is Lee. Say hello in one sentence.');
    await expect(page.getByText('Hi Lee, welcome to Hashbrown!')).toBeVisible();
    await expect(
      page.getByText('Saved on the server', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Conversation', exact: true })
      .selectOption('personal');
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    await send(page, 'What is my name?');
    await expect(page.getByText('Your name is Sam.')).toBeVisible();
    await expect(
      page.getByText('Saved on the server', { exact: true }),
    ).toBeVisible();
    expect(requests.at(-1)?.messages).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hi Sam, welcome to Hashbrown!',
      }),
    );
    const snapshot = await store.read('sam', 'personal');
    if (!snapshot) throw new Error('Missing recorded thread');
    await store.compareAndSwap('sam', 'personal', snapshot.version, [
      { role: 'assistant', content: 'Another window saved this conversation.' },
    ]);
    await send(page, 'Please continue.');
    await expect(page.getByRole('alert')).toContainText('Another session');
    await page.waitForTimeout(900);
    if (capture) {
      const frame = resolve(work, 'server-threads-conflict-frame.png');
      const bounds = await page.locator('main').boundingBox();
      if (!bounds) throw new Error('Missing thread view');
      await page.screenshot({ path: frame });
      crop(frame, resolve(assets, 'server-threads-conflict.png'), bounds);
    }
    await page
      .getByRole('button', { name: 'Reload saved conversation', exact: true })
      .click();
    await expect(
      page.getByText('Another window saved this conversation.'),
    ).toBeVisible();
  } else {
    await runtimeRun(page);
    await expect(page.getByTestId('runtime-output')).toContainText('4200');
    await page.waitForTimeout(700);
    await page
      .getByRole('button', { name: 'Try browser access', exact: true })
      .click();
    await runtimeRun(page);
    await expect(page.getByTestId('runtime-output')).toContainText('error');
    await expect(page.getByTestId('runtime-output')).toContainText('document');
    await page.waitForTimeout(700);
    await page
      .getByRole('button', { name: 'Try invalid arguments', exact: true })
      .click();
    await runtimeRun(page);
    await expect(page.getByTestId('runtime-output')).toContainText('error');
    await expect(page.getByTestId('runtime-output')).toContainText('USD');
    await page.waitForTimeout(700);
    await page
      .getByRole('button', { name: 'Calculate basket total', exact: true })
      .click();
    await runtimeRun(page);
    await expect(page.getByTestId('runtime-output')).toContainText('4200');
  }
}
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  for (const sdk of ['react', 'angular']) {
    for (const mode of selected) {
      store = seed();
      const capture = record && sdk === 'react';
      const context = await browser.newContext({
        viewport: { width: 1440, height: 810 },
        ...(capture
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
      if (mode === 'server-threads') await login(page);
      await page.goto(`${origin}/${sdk}.html?mode=${mode}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(500);
      await exercise(page, mode, capture);
      await page.waitForTimeout(800);
      expect(errors).toEqual([]);
      if (capture) {
        const bounds = await page.locator('main').boundingBox();
        if (!bounds || bounds.y + bounds.height > 746)
          throw new Error(
            `Content overlaps footer: ${mode} ${JSON.stringify(bounds)}`,
          );
        await page.screenshot({ path: resolve(work, `${mode}-frame.png`) });
        crop(
          resolve(work, `${mode}-frame.png`),
          resolve(assets, `${mode}-result.png`),
          bounds,
        );
      }
      const video = page.video();
      await context.close();
      if (capture && video) encode(mode, await video.path());
      results.push({ sdk, mode, passed: true });
      console.log(`${sdk}/${mode}: passed`);
      writeFileSync(
        resolve(work, 'verification-in-progress.json'),
        JSON.stringify(results, null, 2),
      );
    }
    if (selected.includes('server-threads')) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await login(page);
      const open = async () => {
        store = seed();
        await page.goto(`${origin}/${sdk}.html?mode=server-threads`);
        await expect(page.getByLabel('Your message')).toBeVisible();
      };
      await open();
      let release: (() => void) | undefined;
      let saveStarted = false;
      await page.route('**/api/threads/personal', async (route) => {
        if (route.request().method() === 'PUT') {
          saveStarted = true;
          await new Promise<void>((done) => {
            release = done;
          });
        }
        await route.continue();
      });
      await send(page, 'My name is Sam. Say hello.');
      await expect(
        page.getByText('Saving conversation...', { exact: true }),
      ).toBeVisible();
      await expect.poll(() => saveStarted).toBe(true);
      await expect(
        page.getByRole('combobox', { name: 'Conversation', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Send message', exact: true }),
      ).toBeDisabled();
      release?.();
      await expect(
        page.getByText('Saved on the server', { exact: true }),
      ).toBeVisible();
      await page.unroute('**/api/threads/personal');
      await send(page, 'What is my name?');
      await expect(page.getByText('Your name is Sam.')).toBeVisible();
      await expect(
        page.getByText('Saved on the server', { exact: true }),
      ).toBeVisible();
      expect((await store.read('sam', 'personal'))?.version).toBe(2);
      await page
        .getByRole('combobox', { name: 'Conversation', exact: true })
        .selectOption('work');
      await expect(page.getByLabel('Your message')).toBeVisible();
      await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toHaveCount(
        0,
      );
      results.push({ sdk, case: 'serialized-save-and-switch', passed: true });
      await open();
      await page.route('**/api/threads/personal', (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Save unavailable"}',
            })
          : route.continue(),
      );
      await send(page, 'My name is Sam. Say hello.');
      await expect(page.getByRole('alert')).toContainText(
        'Keep this page open',
      );
      await expect(
        page.getByText('Hi Sam, welcome to Hashbrown!'),
      ).toBeVisible();
      expect((await store.read('sam', 'personal'))?.version).toBe(0);
      await page.unroute('**/api/threads/personal');
      await page
        .getByRole('button', { name: 'Reload saved conversation', exact: true })
        .click();
      await expect(page.getByLabel('Your message')).toBeVisible();
      await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toHaveCount(
        0,
      );
      results.push({
        sdk,
        case: 'failed-save-retains-visible-messages',
        passed: true,
      });
      await open();
      await store.compareAndSwap('sam', 'personal', 0, [
        { role: 'assistant', content: 'Saved by another window.' },
      ]);
      await send(page, 'My name is Sam. Say hello.');
      await expect(page.getByRole('alert')).toContainText('Another session');
      await expect(
        page.getByText('Hi Sam, welcome to Hashbrown!'),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Reload saved conversation', exact: true })
        .click();
      await expect(page.getByText('Saved by another window.')).toBeVisible();
      await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toHaveCount(
        0,
      );
      results.push({ sdk, case: 'conflict-and-explicit-reload', passed: true });
      let waiting = false;
      let releaseLoad: (() => void) | undefined;
      await page.route('**/api/threads/personal', async (route) => {
        if (route.request().method() === 'GET') {
          waiting = true;
          await new Promise<void>((done) => {
            releaseLoad = done;
          });
        }
        await route.continue().catch(() => undefined);
      });
      store = seed();
      await page.goto(`${origin}/${sdk}.html?mode=server-threads`);
      await expect(
        page.getByText('Loading saved conversation...'),
      ).toBeVisible();
      await expect.poll(() => waiting).toBe(true);
      await page
        .getByRole('combobox', { name: 'Conversation', exact: true })
        .selectOption('work');
      await expect(page.getByLabel('Your message')).toBeVisible();
      releaseLoad?.();
      await page.waitForTimeout(250);
      await expect(
        page.getByRole('combobox', { name: 'Conversation', exact: true }),
      ).toHaveValue('work');
      await send(page, 'My name is Lee. Say hello.');
      await expect(
        page.getByText('Hi Lee, welcome to Hashbrown!'),
      ).toBeVisible();
      await expect(
        page.getByText('Saved on the server', { exact: true }),
      ).toBeVisible();
      expect((await store.read('sam', 'personal'))?.version).toBe(0);
      expect((await store.read('sam', 'work'))?.version).toBe(1);
      await page.unroute('**/api/threads/personal');
      results.push({
        sdk,
        case: 'stale-load-does-not-replace-selection',
        passed: true,
      });
      expect(errors).toEqual([]);
      await context.close();
    }
    if (selected.includes('javascript-runtime')) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/${sdk}.html?mode=javascript-runtime`);
      await page
        .getByLabel('JavaScript code')
        .fill('globalThis.saved = 7; saved;');
      await runtimeRun(page);
      await expect(page.getByTestId('runtime-output')).toContainText('7');
      await page.getByLabel('JavaScript code').fill('typeof saved;');
      await runtimeRun(page);
      await expect(page.getByTestId('runtime-output')).toContainText(
        'undefined',
      );
      await page.getByLabel('JavaScript code').fill('while (true) {}');
      await runtimeRun(page);
      await expect(page.getByTestId('runtime-output')).toContainText('error');
      await page
        .getByRole('button', { name: 'Calculate basket total' })
        .click();
      await runtimeRun(page);
      await expect(page.getByTestId('runtime-output')).toContainText('4200');
      results.push({
        sdk,
        case: 'fresh-context-timeout-and-recovery',
        passed: true,
      });
      expect(errors).toEqual([]);
      await context.close();
    }
  }
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
