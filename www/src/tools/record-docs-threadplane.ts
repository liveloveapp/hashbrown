/** Verifies separately installed Threadplane consumers and records their actual framework UIs. */
import { chromium, expect, type Page, type Response } from '@playwright/test';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import type { RecipePhase } from './docs-recipe-browser';
import { cropRecipeScreenshot, encodeRecipeVideo } from './docs-recipe-video';
import {
  createThreadplaneProviderEvents,
  selectThreadplaneModes,
} from './docs-threadplane-fixtures';

type Sdk = 'react' | 'angular';
const selected = selectThreadplaneModes(process.env['DOCS_DEMO_MODES']);
const record = process.env['DOCS_SKIP_RECORDING'] !== '1';
const work = resolve('dist/docs-threadplane');
const assets = resolve('www/public/video/docs');
const captureWork = resolve(work, 'captures', randomUUID());
const roots = {
  react: resolve(
    process.env['DOCS_THREADPLANE_REACT_ROOT'] ?? resolve(work, 'react'),
  ),
  angular: resolve(
    process.env['DOCS_THREADPLANE_ANGULAR_ROOT'] ?? resolve(work, 'angular'),
  ),
};
const serverRoot = resolve(
  process.env['DOCS_THREADPLANE_SERVER_ROOT'] ?? roots.react,
);
mkdirSync(work, { recursive: true });
mkdirSync(assets, { recursive: true });
if (record) mkdirSync(captureWork, { recursive: true });
function installedPackage(root: string, name: string, packageName = name) {
  const require = createRequire(resolve(root, 'package.json'));
  const entry = require.resolve(name);
  const installedRoot = realpathSync(resolve(root, 'node_modules')) + sep;
  if (!realpathSync(entry).startsWith(installedRoot))
    throw new Error(
      `${name} must resolve inside the installed consumer, got ${entry}`,
    );
  let directory = dirname(entry);
  for (;;) {
    const path = resolve(directory, 'package.json');
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      if (manifest.name === packageName)
        return {
          name,
          version: manifest.version,
          entry: realpathSync(entry),
          packageRoot: realpathSync(directory),
        };
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error(`Could not locate installed ${name} manifest`);
    directory = parent;
  }
}
const installations = (['react', 'angular'] as const).map((sdk) => {
  const root = roots[sdk];
  for (const path of ['package.json', 'package-lock.json', 'dist/index.html'])
    if (!existsSync(resolve(root, path)))
      throw new Error(
        `Build the installed ${sdk} consumer first: missing ${root}/${path}`,
      );
  const names =
    sdk === 'react'
      ? [
          'react',
          'react-dom',
          '@threadplane/react/chat',
          '@threadplane/core',
          '@threadplane/content',
          '@hashbrownai/core',
          '@hashbrownai/react',
        ]
      : [
          '@angular/core',
          '@angular/common',
          '@angular/platform-browser',
          '@threadplane/chat',
          '@threadplane/ag-ui',
          '@ag-ui/client',
          '@ag-ui/core',
        ];
  const packages = names.map((name) =>
    installedPackage(
      root,
      name,
      name === '@threadplane/react/chat' ? '@threadplane/react' : name,
    ),
  );
  const framework = sdk === 'react' ? 'react' : '@angular/core';
  const frameworkEntry = installedPackage(root, framework).entry;
  const frameworkPeers = packages
    .filter(
      (pkg) =>
        pkg.name === '@threadplane/react/chat' ||
        pkg.name === '@threadplane/chat' ||
        pkg.name === '@threadplane/ag-ui',
    )
    .map((pkg) => {
      const peerRequire = createRequire(
        resolve(pkg.packageRoot, 'package.json'),
      );
      const entry = realpathSync(peerRequire.resolve(framework));
      if (entry !== frameworkEntry)
        throw new Error(
          `Duplicate ${framework} runtime from ${pkg.name}: ${entry}`,
        );
      return { package: pkg.name, framework, entry };
    });
  const require = createRequire(resolve(root, 'package.json'));
  const css = require.resolve(
    sdk === 'react'
      ? '@threadplane/react/chat/styles.css'
      : '@threadplane/chat/themes/default-light.css',
  );
  return {
    sdk,
    root: realpathSync(root),
    frameworkPeers,
    index: resolve(root, 'dist/index.html'),
    manifest: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')),
    lockSha256: createHash('sha256')
      .update(readFileSync(resolve(root, 'package-lock.json')))
      .digest('hex'),
    packages,
    stylesheet: realpathSync(css),
  };
});
// Put the checked server source inside the installed consumer before bundling.
// Its bare imports and the emitted runtime's externals then resolve that
// consumer's actual dependencies, with no workspace/source resolution mapping.
mkdirSync(resolve(serverRoot, 'server'), { recursive: true });
const serverSource = resolve(serverRoot, 'server/threadplane-app.ts');
copyFileSync(
  resolve('www/examples/threadplane-consumers/server/threadplane-app.ts'),
  serverSource,
);
const serverRequire = createRequire(resolve(serverRoot, 'package.json'));
const serverConfig = resolve(serverRoot, 'server/tsconfig.json');
writeFileSync(
  serverConfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        noEmit: true,
        types: ['node'],
      },
      files: ['./threadplane-app.ts'],
    },
    null,
    2,
  ),
);
execFileSync(
  process.execPath,
  [serverRequire.resolve('typescript/bin/tsc'), '-p', serverConfig],
  { cwd: serverRoot, stdio: 'inherit' },
);
const serverPackages = [
  '@hashbrownai/openai',
  '@hashbrownai/core',
  '@ag-ui/core',
  '@ag-ui/encoder',
  'express',
  'openai',
].map((name) => installedPackage(serverRoot, name));
await build({
  configFile: false,
  root: serverRoot,
  ssr: { noExternal: ['@hashbrownai/openai', '@hashbrownai/core'] },
  build: {
    ssr: serverSource,
    outDir: resolve(serverRoot, 'server-dist'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'threadplane-app.mjs' } },
  },
});
const { createThreadplaneApp } = await import(
  pathToFileURL(resolve(serverRoot, 'server-dist/threadplane-app.mjs')).href
);
const css = `*{box-sizing:border-box}body{margin:0;padding:0;background:#faf9f0;color:#302820;font:17px/1.5 Arial,sans-serif}header{height:80px;padding:20px 64px;border-bottom:1px solid #e7dfce;display:flex;align-items:center;justify-content:space-between}.tag{font-size:12px;letter-spacing:1.4px;text-transform:uppercase}.brand{font-size:21px;font-weight:bold;color:#8a571f}main{width:min(920px,calc(100% - 40px));margin:22px auto 80px}h1{font-size:31px;line-height:1.2;letter-spacing:-.8px;margin:0 0 18px}main.tp-chat{gap:14px}main>section[aria-label=Conversation]{background:#fff;border:1px solid #dfd8c8;border-radius:14px;padding:5px 22px;min-height:200px}main>section[aria-label=Conversation] li{margin-block:10px!important}.tp-chat-input{background:#fff;border:1px solid #dfd8c8;border-radius:14px;padding:14px 18px}.tp-chat-input__label{font-size:14px}.tp-chat-input__textarea{font:17px/1.5 Arial,sans-serif;min-height:50px}.tp-chat-input__send,.tp-chat-input__stop{font:600 14px Arial;background:#fbbb52;color:#302820;border:0;border-radius:9px;padding:10px 16px}main>p[role=status]{font-size:13px;color:#786c5e;margin:0}chat{height:570px!important;max-height:calc(100dvh - 220px)!important;border:1px solid #dfd8c8;border-radius:14px;overflow:hidden;background:white}footer{position:fixed;left:0;bottom:0;width:100%;padding:16px 64px;background:#faf9f0;border-top:1px solid #e7dfce;color:#786c5e;font-size:12px;display:flex;justify-content:space-between;gap:20px}@media(max-width:600px){header,footer{padding:16px 20px}header{height:72px}h1{font-size:26px}footer{font-size:10px}.tp-chat-input{padding:12px}chat{height:570px!important;max-height:calc(100dvh - 210px)!important}}`;
const shippingQuestion = 'Where can I find shipping information?';
const shippingReply = 'Shipping information is on the Shipping page in Help.';
const followupQuestion = 'Does that include delivery estimates?';
const followupReply =
  'Yes. The Shipping page includes delivery estimates and tracking information.';
type Scenario = {
  outcome?: 'failed' | 'truncated';
  terminalDelay?: number;
  text?: string;
};
let scenario: Scenario = {};
let rawRequests: {
  sdk: Sdk;
  input: {
    runId: string;
    threadId: string;
    messages: { id: string; role: string; content: unknown }[];
  };
  output: string[];
}[] = [];
let providerRequests: Record<string, unknown>[] = [];
let providerQueue: Scenario[] = [];
let abortedProviders = 0;
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const provider = express();
provider.use(express.json());
provider.post('/v1/responses', async (req, res) => {
  const next = providerQueue[0] ?? {};
  providerQueue = providerQueue.slice(1);
  const index = providerRequests.length;
  providerRequests = [...providerRequests, req.body];
  expect(req.body.store).toBe(false);
  expect(req.body.instructions).toContain('general product questions');
  res.once('close', () => {
    if (!res.writableEnded) abortedProviders += 1;
  });
  res.setHeader('Content-Type', 'text/event-stream');
  const users = req.body.input.filter(
    (item: { role: string }) => item.role === 'user',
  );
  const text =
    next.text ?? (users.length === 1 ? shippingReply : followupReply);
  const events =
    next.outcome === 'failed'
      ? [
          {
            type: 'error',
            code: 'fixture_failure',
            message: 'Scripted provider failure',
            sequence_number: 0,
          },
        ]
      : createThreadplaneProviderEvents(text, `provider-message-${index}`);
  for (const event of events) {
    if (event.type === 'response.completed') {
      if (next.outcome === 'truncated') break;
      await pause(next.terminalDelay ?? 400);
    }
    if (res.destroyed) break;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'response.output_text.delta') await pause(90);
  }
  res.end();
});
const providerServer = createServer(provider);
await new Promise<void>((done) => providerServer.listen(0, '127.0.0.1', done));
const providerAddress = providerServer.address();
if (!providerAddress || typeof providerAddress === 'string')
  throw new Error('Missing provider fixture port');
const servers: ReturnType<typeof createServer>[] = [];
const origins: Record<Sdk, string> = { react: '', angular: '' };
for (const sdk of ['react', 'angular'] as const) {
  const app = express();
  app.get('/', (_req, res) => {
    const html = readFileSync(resolve(roots[sdk], 'dist/index.html'), 'utf8');
    res
      .type('html')
      .send(
        html
          .replace('</head>', `<style>${css}</style></head>`)
          .replace(
            '<body>',
            `<body><header><span class="tag">Hashbrown + Threadplane / ${sdk}</span><span class="brand">hashbrown</span></header>`,
          )
          .replace(
            '</body>',
            '<footer><span>Installed components. One conversation.</span><span>Scripted provider output · presentation styles added · no narration</span></footer></body>',
          ),
      );
  });
  app.use('/media', express.static(assets));
  app.use(express.static(resolve(roots[sdk], 'dist')));
  app.post('/api/chat', express.json({ limit: '64kb' }), (req, res, next) => {
    const request = { sdk, input: req.body, output: [] as string[] };
    const write = res.write.bind(res);
    res.write = ((chunk: string | Buffer, ...args: unknown[]) => {
      request.output.push(chunk.toString());
      return Reflect.apply(write, res, [chunk, ...args]);
    }) as typeof res.write;
    rawRequests = [...rawRequests, request];
    providerQueue = [...providerQueue, scenario];
    scenario = {};
    next();
  });
  app.use(
    createThreadplaneApp({
      apiKey: 'local-fixture-not-a-key',
      model: 'gpt-5-mini',
      baseURL: `http://127.0.0.1:${providerAddress.port}/v1`,
    }),
  );
  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing consumer port');
  servers.push(server);
  origins[sdk] = `http://127.0.0.1:${address.port}`;
}
const composer = (page: Page, sdk: Sdk) =>
  page.getByRole('textbox', {
    name: sdk === 'react' ? 'Your message' : 'Type a message',
    exact: true,
  });
const sendButton = (page: Page, sdk: Sdk) =>
  page.getByRole('button', {
    name: sdk === 'react' ? 'Send' : 'Send message',
    exact: true,
  });
const stopButton = (page: Page, sdk: Sdk) =>
  page.getByRole('button', {
    name: sdk === 'react' ? 'Stop' : 'Stop generating',
    exact: true,
  });
const assistants = (page: Page, sdk: Sdk) =>
  sdk === 'react'
    ? page
        .getByRole('region', { name: 'Conversation', exact: true })
        .getByRole('listitem')
        .filter({
          has: page.locator('span').filter({ hasText: /^Assistant$/ }),
        })
    : page.locator('chat-message[data-role="assistant"]');
async function start(
  page: Page,
  sdk: Sdk,
  text: string,
  next: Scenario = {},
  keyboard = false,
): Promise<Response> {
  await composer(page, sdk).fill(text);
  const before = rawRequests.length;
  scenario = next;
  const response = page.waitForResponse(
    (response) =>
      response.url() === `${origins[sdk]}/api/chat` &&
      response.request().method() === 'POST',
  );
  if (keyboard) await composer(page, sdk).press('Enter');
  else await sendButton(page, sdk).click();
  await expect.poll(() => rawRequests.length).toBe(before + 1);
  return response;
}
async function ready(page: Page, sdk: Sdk) {
  await expect(stopButton(page, sdk)).toHaveCount(0);
  await expect(sendButton(page, sdk)).toBeVisible();
  if (sdk === 'react')
    await expect(page.getByRole('status')).toHaveText('Ready');
}
async function complete(page: Page, sdk: Sdk, text: string) {
  await expect(assistants(page, sdk).last()).toContainText(text);
  await ready(page, sdk);
}
async function open(page: Page, sdk: Sdk) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = rawRequests.length;
  await page.goto(origins[sdk]);
  await page
    .getByRole('heading', { name: 'Ask a product question', exact: true })
    .waitFor();
  await expect(composer(page, sdk)).toBeVisible();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
  expect(rawRequests).toHaveLength(before);
  return errors;
}
async function demonstrate(
  page: Page,
  sdk: Sdk,
  phase: (text: string) => void = () => undefined,
) {
  phase('Ask where to find shipping information.');
  await start(page, sdk, shippingQuestion);
  await expect(stopButton(page, sdk)).toBeVisible();
  await complete(page, sdk, shippingReply);
  // Observe the actual server's encoded wire events. Hashbrown may abort its
  // completed fetch after RUN_FINISHED, making Chromium's response body unavailable.
  const firstWireRequest = rawRequests.at(-1);
  if (!firstWireRequest) throw new Error('Missing first wire request');
  const events = firstWireRequest.output.join('')
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5)));
  const firstRequest = rawRequests.at(-1)?.input;
  const assistantId = events.find(
    (event) => event.type === 'TEXT_MESSAGE_START',
  )?.messageId;
  expect(typeof assistantId).toBe('string');
  phase(
    'The actual Threadplane transcript displays the streamed shipping reply.',
  );
  await page.waitForTimeout(1200);
  phase('Send a follow-up in the same conversation.');
  await start(page, sdk, followupQuestion);
  await complete(page, sdk, followupReply);
  expect(rawRequests.at(-1)?.input.threadId).toBe(firstRequest?.threadId);
  expect(rawRequests.at(-1)?.input.runId).not.toBe(firstRequest?.runId);
  const history = rawRequests
    .at(-1)
    ?.input.messages.filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    );
  expect(history).toEqual([
    expect.objectContaining({ role: 'user', content: shippingQuestion }),
    expect.objectContaining({
      id: assistantId,
      role: 'assistant',
      content: shippingReply,
    }),
    expect.objectContaining({ role: 'user', content: followupQuestion }),
  ]);
  phase(
    'The follow-up includes the completed first turn with its canonical message ID.',
  );
  await page.waitForTimeout(1300);
}
const browser = await chromium.launch();
const results: Record<string, unknown>[] = [];
try {
  writeFileSync(
    resolve(work, 'installed-packages.json'),
    JSON.stringify({ installations, serverRoot, serverPackages }, null, 2),
  );
  for (const sdk of ['react', 'angular'] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const errors = await open(page, sdk);
    try {
      await demonstrate(page, sdk);
      const count = rawRequests.length;
      await composer(page, sdk).fill('Keyboard question');
      await composer(page, sdk).press('Shift+Enter');
      await expect(composer(page, sdk)).toHaveValue('Keyboard question\n');
      expect(rawRequests).toHaveLength(count);
      await start(
        page,
        sdk,
        'Send with Enter.',
        { text: 'Keyboard submission works.' },
        true,
      );
      await complete(page, sdk, 'Keyboard submission works.');
      for (const outcome of ['failed', 'truncated'] as const) {
        await start(page, sdk, 'Show an explicit failure.', { outcome });
        await expect(page.getByRole('alert')).toBeVisible();
        await ready(page, sdk);
        await start(page, sdk, 'Try the request again.', {
          text: 'The explicit recovery succeeded.',
        });
        await complete(page, sdk, 'The explicit recovery succeeded.');
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      let aborted = abortedProviders;
      const completedAssistants = await assistants(page, sdk).count();
      await start(page, sdk, 'Stop this response.', {
        text: 'Partial text stays after Stop.',
        terminalDelay: 1800,
      });
      await expect(assistants(page, sdk).last()).toContainText('Partial text');
      await stopButton(page, sdk).click();
      await ready(page, sdk);
      await expect.poll(() => abortedProviders).toBeGreaterThan(aborted);
      if (sdk === 'react') {
        await expect(assistants(page, sdk)).toHaveCount(completedAssistants);
      } else {
        await expect(assistants(page, sdk).last()).toContainText(
          'Partial text',
        );
      }
      await start(page, sdk, 'Continue after stopping.', {
        text: 'A fresh response after Stop.',
      });
      await complete(page, sdk, 'A fresh response after Stop.');
      await page.waitForTimeout(1900);
      await expect(assistants(page, sdk).last()).toContainText(
        'A fresh response after Stop.',
      );
      aborted = abortedProviders;
      await start(page, sdk, 'Navigate during this reply.', {
        text: 'Navigation cancellation.',
        terminalDelay: 1800,
      });
      await expect(assistants(page, sdk).last()).toContainText('Navigation');
      await page.goto('about:blank');
      await expect.poll(() => abortedProviders).toBeGreaterThan(aborted);
      await open(page, sdk);
      await expect(assistants(page, sdk)).toHaveCount(0);
      expect(errors).toEqual([]);
    } catch (error) {
      await page.screenshot({ path: resolve(work, `${sdk}-failure.png`) });
      writeFileSync(
        resolve(work, `${sdk}-failure.txt`),
        await page.locator('body').innerText(),
      );
      throw error;
    }
    results.push({
      sdk,
      installedConsumer: true,
      noAutomaticRequest: true,
      canonicalFollowup: true,
      streaming: true,
      keyboard: true,
      failureRecovery: true,
      stopRecovery: true,
      unfinishedReplyAfterStop:
        sdk === 'react'
          ? 'removed by Hashbrown 0.8.0'
          : 'retained by Threadplane AG-UI',
      navigationAbortsProvider: true,
      freshPageClearsConversation: true,
      lifecycleNote:
        'Observed navigation cancellation and page lifetime; not independent instrumentation of every internal disposal callback.',
      passed: true,
    });
    await context.close();
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const mobilePage = await mobile.newPage();
    await open(mobilePage, sdk);
    await demonstrate(mobilePage, sdk);
    expect(
      await mobilePage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    if (sdk === 'angular') {
      const inputBounds = await composer(mobilePage, sdk).boundingBox();
      const chatBounds = await mobilePage.locator('chat').boundingBox();
      if (!inputBounds || !chatBounds)
        throw new Error('Missing Angular composer or chat bounds');
      expect(inputBounds.y + inputBounds.height).toBeLessThanOrEqual(
        chatBounds.y + chatBounds.height,
      );
    }
    await mobilePage.screenshot({ path: resolve(work, `${sdk}-mobile.png`) });
    results.push({ sdk, mobileLayout: true, passed: true });
    await mobile.close();
  }
  // Neither public recording is replaced until both installed consumers pass.
  if (record)
    for (const mode of selected) {
      const sdk = (
        {
          'threadplane-react': 'react',
          'threadplane-angular': 'angular',
        } as const
      )[mode];
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: {
          dir: resolve(captureWork, 'raw'),
          size: { width: 1440, height: 900 },
        },
      });
      const page = await context.newPage();
      const started = Date.now();
      const phases: RecipePhase[] = [];
      await open(page, sdk);
      await page.waitForTimeout(600);
      await demonstrate(page, sdk, (text) =>
        phases.push({ seconds: (Date.now() - started) / 1000, text }),
      );
      await page.waitForTimeout(1400);
      const bounds = await page.locator('main').boundingBox();
      if (!bounds || bounds.y + bounds.height > 840)
        throw new Error(
          `${sdk} content overlaps recording footer: ${JSON.stringify(bounds)}`,
        );
      const frame = resolve(captureWork, `${mode}-frame.png`);
      await page.screenshot({ path: frame });
      const screenshot = cropRecipeScreenshot(
        frame,
        resolve(assets, `${mode}-result.png`),
        bounds,
      );
      const video = page.video();
      await context.close();
      if (!video) throw new Error(`Missing ${sdk} recording`);
      const description = `The actual installed ${sdk === 'react' ? 'React ChatInput and TextTranscript' : 'Angular Chat component and AG-UI adapter'} sends a shipping question, displays a streaming reply, and sends a follow-up containing the completed conversation. Hashbrown's actual OpenAI adapter runs on the server.`;
      const disclosure =
        'Provider-native Responses events are scripted over local HTTP. No live model or provider key. Presentation styles, header and footer are added. No narration. Both separately installed consumers passed behavior checks before either recording was replaced.';
      const media = encodeRecipeVideo(
        mode,
        await video.path(),
        captureWork,
        assets,
        phases,
        description,
        disclosure,
      );
      // The shared encoder's legacy preamble names React; these are genuinely
      // separate recordings, so publish a framework-specific companion instead.
      writeFileSync(
        resolve(assets, `${mode}-transcript.txt`),
        `${mode}\n\nRecorded through the actual installed ${sdk} consumer. ${disclosure}\n\nThe first two seconds preview the final result; the complete interaction follows.\n\n${description}\n\nObserved phases before the two-second preview is added:\n${phases.map((phase) => `${phase.seconds.toFixed(2)}s: ${phase.text}`).join('\n')}\n\nStop, failure, recovery, keyboard interaction, mobile layout and navigation cancellation were checked separately in both consumers. Navigation cancellation does not independently establish every internal disposal callback.\n`,
      );
      const playback = await browser.newPage();
      await playback.goto(origins[sdk]);
      for (const extension of ['mp4', 'webm']) {
        const info = await playback.evaluate(async (source) => {
          const video = document.createElement('video');
          video.muted = true;
          video.src = source;
          document.body.append(video);
          await new Promise<void>((done, reject) => {
            video.onloadedmetadata = () => done();
            video.onerror = () =>
              reject(new Error('Threadplane playback metadata failed'));
          });
          await video.play();
          await new Promise((done) => setTimeout(done, 250));
          const info = {
            width: video.videoWidth,
            height: video.videoHeight,
            currentTime: video.currentTime,
          };
          video.pause();
          video.remove();
          return info;
        }, `${origins[sdk]}/media/${mode}.${extension}`);
        expect(info.width).toBe(1440);
        expect(info.height).toBe(900);
        expect(info.currentTime).toBeGreaterThan(0);
      }
      await playback.close();
      results.push({
        mode,
        actualRecordedSdk: sdk,
        captureWork,
        viewport: { width: 1440, height: 900 },
        screenshot,
        playback: ['mp4', 'webm'],
        ...media,
      });
    }
  writeFileSync(
    resolve(work, 'requests.json'),
    JSON.stringify({ rawRequests, providerRequests }, null, 2),
  );
  writeFileSync(
    resolve(work, 'verification.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  writeFileSync(
    resolve(work, 'verification-failure.json'),
    JSON.stringify(
      {
        results,
        error: error instanceof Error ? error.stack : String(error),
        rawRequests,
        providerRequests,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  for (const server of [...servers, providerServer]) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
