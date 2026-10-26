/** Records the checked workflow clients with deterministic AG-UI output and ffmpeg. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  createWorkflowEvents,
  type WorkflowDemoMode,
} from './docs-workflow-fixtures';

const modes = [
  'persistence',
  'interrupts',
  'shared-state',
  'activities',
  'ui-kits',
] as const;
type Mode = (typeof modes)[number];
const requested = process.env['DOCS_DEMO_MODES']?.split(',');
if (requested?.some((mode) => !modes.includes(mode as Mode)))
  throw new Error('Unknown docs workflow mode');
const selected = modes.filter((mode) => !requested || requested.includes(mode));
const work = resolve('dist/docs-workflows');
const compiled = resolve('dist/docs-quickstart/compiled');
const assets = resolve('www/public/video/docs');
mkdirSync(work, { recursive: true });
const captions: Record<Mode, string> = {
  persistence: 'Refresh and restore a completed text conversation',
  interrupts: 'Pause for a complete batch of approval answers',
  'shared-state': 'Edit application state, then apply an agent update',
  activities: 'Display progress without adding it to the model conversation',
  'ui-kits': 'Offer your trusted components as a reusable kit',
};
const css = `
*{box-sizing:border-box}body{margin:0;background:#faf9f0;color:#302820;font:18px/1.5 Arial,sans-serif}
header{height:104px;padding:26px 64px;border-bottom:1px solid #e7dfce;display:flex;justify-content:space-between;align-items:center;font-weight:700}
.brand{color:#8a571f;font-size:20px}.tag{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#786c5e}
main{width:920px;margin:24px auto}h1{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:0 0 18px}h2{font-size:24px;line-height:1.3;margin:0 0 8px}
article{margin-top:18px;padding:20px 28px;background:#fff;border:1px solid #dfd8c8;border-radius:16px;box-shadow:0 8px 24px #30282009}article p{margin:8px 0;color:#62574b}
button{font:600 15px Arial;border:0;border-radius:10px;padding:12px 18px;background:#fbbb52;color:#302820;cursor:pointer;margin:0 8px 4px 0}button:disabled{opacity:.6}
label{display:block;font-size:14px;margin-bottom:5px}input,select{font:16px Arial;padding:10px 14px;border:1px solid #cbbfa9;background:#fff;border-radius:9px;margin-bottom:12px}input{width:100%}select{min-width:200px}ol,ul{padding-left:25px;font-size:17px;margin:12px 0}li{padding:3px 0}p{margin:10px 0}progress{width:100%;height:20px;accent-color:#95601e}
footer{position:fixed;bottom:0;width:100%;padding:18px 64px;border-top:1px solid #e7dfce;font-size:12px;color:#786c5e;background:#faf9f0;display:flex;justify-content:space-between}#phase{font-weight:700;color:#40352b}
`;

/** Crops a full viewport capture without changing the recorded browser viewport. */
function cropFrame(
  source: string,
  target: string,
  region: { width: number; height: number; x: number; y: number },
): void {
  const crop = [region.width, region.height, region.x, region.y]
    .map(Math.round)
    .join(':');
  execFileSync('ffmpeg', ['-y', '-i', source, '-vf', `crop=${crop}`, target], {
    stdio: 'ignore',
  });
}

function textRun(input: RunAgentInput, text: string): AGUIEvent[] {
  const messageId = `${input.runId}:answer`;
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    },
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    ...Array.from(text.match(/.{1,10}/gs) ?? [], (delta): AGUIEvent => ({
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

const requests: { readonly mode: Mode; readonly input: RunAgentInput }[] = [];
let failState = false;
const encoder = new EventEncoder();
const app = express();
app.use(express.static(resolve(work, 'browser')));
app.use(express.json());
app.post('/api/chat', async (req, res) => {
  const input = req.body as RunAgentInput;
  const mode = req.query['demo'] as Mode;
  if (!modes.includes(mode)) {
    res.status(400).end('Unknown demo');
    return;
  }
  requests.push({ mode, input });
  let events: AGUIEvent[];
  if (mode === 'persistence') {
    const userMessages = input.messages.filter(
      (message) => message.role === 'user',
    );
    const name =
      userMessages
        .map((message) =>
          typeof message.content === 'string'
            ? message.content.match(/My name is (\w+)/i)?.[1]
            : undefined,
        )
        .find(Boolean) ?? 'friend';
    const last = userMessages.at(-1);
    const followup =
      typeof last?.content === 'string' &&
      last.content.includes('What is my name');
    events = textRun(
      input,
      followup ? `Your name is ${name}.` : `Hi ${name}, welcome to Hashbrown!`,
    );
  } else if (mode === 'shared-state' && failState) {
    events = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { destination: 'Uncommitted', status: 'Planning' },
      },
      {
        type: EventType.RUN_ERROR,
        message: 'The fixture run failed before committing',
      },
    ];
  } else events = createWorkflowEvents(input, mode as WorkflowDemoMode);
  res.writeHead(200, { 'Content-Type': encoder.getContentType() });
  await new Promise((done) => setTimeout(done, 300));
  for (const event of events) {
    res.write(encoder.encodeSSE(event));
    const delay =
      event.type === EventType.ACTIVITY_SNAPSHOT ||
      event.type === EventType.ACTIVITY_DELTA
        ? 700
        : event.type === EventType.TEXT_MESSAGE_CONTENT
          ? 100
          : 70;
    await new Promise((done) => setTimeout(done, delay));
  }
  res.end();
});

for (const sdk of ['react', 'angular'])
  writeFileSync(
    resolve(compiled, `${sdk}.html`),
    `<!doctype html><html><meta charset="utf-8"><title>Hashbrown workflow example</title><style>${css}</style><body><header><span class="tag">Hashbrown / workflow examples</span><span class="brand">hashbrown</span></header><div id="root"></div><app-root></app-root><footer><span id="phase"></span><span>Scripted AG-UI agent · real client runtime · no narration</span></footer><script type="module" src="/${sdk}-entry.js"></script></body></html>`,
  );
const frame = `const mode=new URLSearchParams(location.search).get('mode')??'persistence';document.querySelector('#phase').textContent=${JSON.stringify(captions)}[mode];document.querySelector('.tag').textContent='Hashbrown / '+mode.replaceAll('-',' ');`;
writeFileSync(
  resolve(compiled, 'react-entry.js'),
  `import React from'react';import{createRoot}from'react-dom/client';import{HashbrownProvider}from'@hashbrownai/react';import{SavedConversations}from'./react/src/SavedConversations.js';import{Workflows}from'./react/src/Workflows.js';${frame}const View=mode==='persistence'?SavedConversations:Workflows;createRoot(document.getElementById('root')).render(React.createElement(HashbrownProvider,{url:'/api/chat?demo='+mode,telemetry:false},React.createElement(View,{mode})));`,
);
writeFileSync(
  resolve(compiled, 'angular-entry.js'),
  `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{provideHashbrown}from'@hashbrownai/angular';import{SavedConversations}from'./angular/src/app/saved-conversations.js';import{Workflows}from'./angular/src/app/workflows.js';${frame}const View=mode==='persistence'?SavedConversations:Workflows;document.querySelector('app-root').outerHTML=mode==='persistence'?'<app-saved-conversations></app-saved-conversations>':'<app-workflows></app-workflows>';bootstrapApplication(View,{providers:[provideZonelessChangeDetection(),provideHashbrown({baseUrl:'/api/chat?demo='+mode,telemetry:false})]}).catch(console.error);`,
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
const fixture = createServer(app);
await new Promise<void>((done) => fixture.listen(0, '127.0.0.1', done));
const address = fixture.address();
if (!address || typeof address === 'string')
  throw new Error('Missing fixture port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];

async function exercise(page: Page, mode: Mode, sdk: string): Promise<void> {
  if (mode === 'persistence') {
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      page.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    await page.waitForTimeout(650);
    const beforeReload = requests.length;
    await page.reload();
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    if (requests.length !== beforeReload)
      throw new Error('Restoring text unexpectedly started a run');
    await page.waitForTimeout(650);
    await page
      .getByRole('combobox', { name: 'Conversation', exact: true })
      .selectOption('work');
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toHaveCount(
      0,
    );
    await page
      .getByLabel('Your message', { exact: true })
      .fill('My name is Lee. Say hello in one sentence.');
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(page.getByText('Hi Lee, welcome to Hashbrown!')).toBeVisible();
    await expect(
      page.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Conversation', exact: true })
      .selectOption('personal');
    await expect(page.getByText('Hi Sam, welcome to Hashbrown!')).toBeVisible();
    await expect(page.getByText('Hi Lee, welcome to Hashbrown!')).toHaveCount(
      0,
    );
    await page
      .getByLabel('Your message', { exact: true })
      .fill('What is my name?');
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(page.getByText('Your name is Sam.')).toBeVisible();
    await expect(
      page.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();
    const last = requests.at(-1)?.input;
    if (
      last?.threadId !== 'personal' ||
      !last.messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === 'Hi Sam, welcome to Hashbrown!',
      )
    )
      throw new Error(`${sdk}: restored transcript was not sent`);
  } else if (mode === 'interrupts') {
    await page
      .getByRole('button', { name: 'Plan a trip', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'Approval required' }),
    ).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(2);
    await page.waitForTimeout(1200);
    if (sdk === 'react' && process.env['DOCS_SKIP_RECORDING'] !== '1') {
      const region = await page
        .getByRole('article', { name: 'Approval required' })
        .boundingBox();
      if (!region) throw new Error('Approval card is missing');
      const framePath = resolve(work, 'interrupts-approval-frame.png');
      await page.screenshot({ path: framePath });
      cropFrame(framePath, resolve(assets, 'interrupts-approval.png'), region);
    }
    await page
      .getByRole('button', { name: 'Approve and resume', exact: true })
      .click();
    await expect(
      page.getByText('Approved. Your Lisbon itinerary is ready.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'Approval required' }),
    ).toHaveCount(0);
    if (requests.at(-1)?.input.resume?.length !== 2)
      throw new Error('Resume did not include the complete batch');
  } else if (mode === 'shared-state') {
    await page.getByLabel('Destination', { exact: true }).fill('Kyoto');
    await page.waitForTimeout(500);
    await page
      .getByRole('button', { name: 'Ask the agent to plan', exact: true })
      .click();
    await expect(
      page.getByText('Your Kyoto plan is ready.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    if (
      (requests.at(-1)?.input.state as { destination?: string })
        ?.destination !== 'Kyoto'
    )
      throw new Error('The edited state was not sent');
  } else if (mode === 'activities') {
    await page
      .getByRole('button', { name: 'Build an itinerary', exact: true })
      .click();
    await expect(
      page.getByRole('progressbar', { name: 'Completed itinerary steps' }),
    ).toHaveAttribute('value', '0');
    await expect(
      page.getByText('Itinerary complete', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Completed itinerary steps' }),
    ).toHaveAttribute('value', '3');
  } else {
    await page
      .getByRole('button', { name: 'Generate a card', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'Welcome card' }),
    ).toBeVisible();
    await page.waitForTimeout(600);
    await page
      .getByLabel('Card to generate', { exact: true })
      .selectOption('status');
    await page
      .getByRole('button', { name: 'Generate a card', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'Status card' }),
    ).toBeVisible();
  }
}

try {
  for (const sdk of ['react', 'angular']) {
    for (const mode of selected) {
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
      await page.goto(`${origin}/${sdk}.html?mode=${mode}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForTimeout(650);
      const before = requests.length;
      await exercise(page, mode, sdk);
      await page.waitForTimeout(1200);
      if (errors.length)
        throw new Error(`${sdk}/${mode}: ${errors.join('; ')}`);
      if (record) {
        const bounds = await page.locator('main').boundingBox();
        if (!bounds || bounds.y + bounds.height > 748)
          throw new Error(
            `${mode}: recording content overlaps the footer: ${JSON.stringify(bounds)}`,
          );
        await page.screenshot({ path: resolve(work, `${mode}-frame.png`) });
        cropFrame(
          resolve(work, `${mode}-frame.png`),
          resolve(assets, `${mode}-result.png`),
          bounds,
        );
      }
      const video = page.video();
      await context.close();
      if (record && video) {
        const raw = await video.path();
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
            '[0:v]fps=30,setpts=PTS-STARTPTS,setsar=1[a];[1:v]fps=30,setpts=PTS-STARTPTS,setsar=1,tpad=stop_mode=clone:stop_duration=2[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]',
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
      results.push({
        sdk,
        mode,
        requests: requests.length - before,
        passed: true,
      });
      console.log(`${sdk}/${mode}: passed`);
      writeFileSync(
        resolve(work, 'verification-in-progress.json'),
        JSON.stringify(results, null, 2),
      );
    }
    // An incompatible saved version must remain untouched until an explicit clear.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      if (!localStorage.getItem('hashbrown:text-history:personal'))
        localStorage.setItem('hashbrown:text-history:personal', '{');
    });
    const page = await context.newPage();
    await page.goto(`${origin}/${sdk}.html?mode=persistence`);
    await expect(page.getByRole('alert')).toContainText(
      'Saved messages could not be restored',
    );
    await expect(
      page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeDisabled();
    if (
      (await page.evaluate(() =>
        localStorage.getItem('hashbrown:text-history:personal'),
      )) !== '{'
    )
      throw new Error('Invalid saved history was overwritten');
    await page.getByRole('button', { name: 'Clear this conversation' }).click();
    await expect(
      page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeEnabled();
    results.push({ sdk, mode: 'invalid-storage-recovery', passed: true });
    await context.close();

    const quota = await browser.newContext();
    await quota.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      };
    });
    const quotaPage = await quota.newPage();
    await quotaPage.goto(`${origin}/${sdk}.html?mode=persistence`);
    await quotaPage
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(quotaPage.getByRole('alert')).toContainText(
      'We could not save or clear',
    );
    await expect(
      quotaPage.getByText('Hi Sam, welcome to Hashbrown!'),
    ).toBeVisible();
    results.push({ sdk, mode: 'storage-quota-failure', passed: true });
    await quota.close();

    if (selected.includes('shared-state')) {
      const rollback = await browser.newContext();
      const statePage = await rollback.newPage();
      const stateErrors: string[] = [];
      statePage.on('pageerror', (error) => stateErrors.push(error.message));
      await statePage.goto(`${origin}/${sdk}.html?mode=shared-state`);
      await statePage.getByLabel('Destination', { exact: true }).fill('Kyoto');
      failState = true;
      await statePage
        .getByRole('button', { name: 'Ask the agent to plan' })
        .click();
      await expect(statePage.getByRole('alert')).toBeVisible();
      await expect(
        statePage.getByRole('button', { name: 'Ask the agent to plan' }),
      ).toBeEnabled();
      expect(stateErrors).toEqual([]);
      await expect(
        statePage.getByLabel('Destination', { exact: true }),
      ).toHaveValue('Kyoto');
      await expect(statePage.getByText('Draft', { exact: true })).toBeVisible();
      failState = false;
      results.push({ sdk, mode: 'state-rollback', passed: true });
      await rollback.close();
    }
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
