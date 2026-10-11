import { createApp } from '@atc/server';
import { LLMock } from '@copilotkit/aimock';
import {
  type BrowserContext,
  chromium,
  type FrameLocator,
  type Page,
} from '@playwright/test';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { scenario } from '../src/fixtures';
import { scriptAtcModel } from '../src/model';
import { renderDirector, STAGE } from './director';
import {
  duration,
  ffmpeg,
  frameArgs,
  loopArgs,
  masterArgs,
  mp4Args,
  webmArgs,
} from './encode';
import {
  beatSceneName,
  DEMO_PROMPTS,
  STORYBOARD,
  storyboardPaths,
} from './storyboard';
import {
  concatList,
  type Frame,
  type Scene,
  sceneOffset,
  sceneSpan,
  type Timeline,
} from './timeline';
import { demoFrame } from './traffic';

/*
 * Records the atc demo video and the home page loop, then encodes them with
 * ffmpeg into dist/examples/atc/demo/. Deterministic and keyless: aimock
 * scripts every model turn (the e2e suite's script) and synthetic frames
 * stand in for adsb.lol. Needs a built atc-angular and ffmpeg.
 *
 * Runs headed, off screen: headless Chrome's screencast ignores the device
 * scale factor, and the 2x frames are what keep text crisp after scaling.
 */

const REPO = resolve(__dirname, '../../../..');
const ATC = resolve(REPO, 'examples/atc');
const DIST = resolve(REPO, 'dist/examples/atc');
const OUT = resolve(DIST, 'demo');
const WORK = resolve(OUT, 'work');
const WORDMARK = resolve(REPO, 'www/public/image/logo/word-mark.svg');
/** The home page loop's size: the same 16:10 as the screenshot it replaces. */
const LOOP = { width: 1440, height: 900 } as const;
const LOOP_FADE_S = 0.8;
const TYPE_DELAY_MS = 32;
const { fastest, arrivals, nearby } = scenario;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A running screencast that records frames and named scenes. */
interface Capture {
  scene<T>(name: string, run: () => Promise<T>): Promise<T>;
  stop(): Promise<Timeline>;
}

/** Screencasts `page` into `dir` as timestamped JPEG frames. */
async function capture(
  page: Page,
  dir: string,
  size: { readonly width: number; readonly height: number },
): Promise<Capture> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  const scenes: Scene[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    writeFileSync(join(dir, file), Buffer.from(data, 'base64'));
    void cdp
      .send('Page.screencastFrameAck', { sessionId })
      .catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: size.width * 2,
    maxHeight: size.height * 2,
  });

  return {
    async scene(name, run) {
      const start = Date.now() / 1000;
      const result = await run();
      scenes.push({ name, start, end: Date.now() / 1000 });

      return result;
    },
    async stop() {
      await cdp.send('Page.stopScreencast');
      await wait(300);
      const timeline = { frames: [...frames], scenes: [...scenes] };
      writeFileSync(join(dir, 'timeline.json'), JSON.stringify(timeline));

      return timeline;
    },
  };
}

/** Serves synthetic traffic, blocks route lookups, and leaves map tiles live. */
async function stubFeeds(context: BrowserContext): Promise<void> {
  let next = 0;
  await context.route('**/api/aircraft**', (route) =>
    route.fulfill({ json: demoFrame(next++) }),
  );
  await context.route('https://vrs-standing-data.adsb.lol/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
}

/** Waits until the map in `app` has drawn and its tiles have loaded. */
async function mapReady(app: FrameLocator | Page): Promise<void> {
  await app
    .getByTestId('airspace-map')
    .and(app.locator('[data-ready]'))
    .waitFor();
  await app.locator('.atc-plane').first().waitFor();
}

/** Types `prompt` into the composer, visibly, and sends it. */
async function ask(app: FrameLocator | Page, prompt: string): Promise<void> {
  const input = app.getByRole('textbox', { name: 'Message' });
  await input.click();
  await input.pressSequentially(prompt, { delay: TYPE_DELAY_MS });
  await wait(250);
  await app.getByRole('button', { name: 'Send' }).click();
}

/** Waits for the answer to `prompt` to finish rendering. */
async function answered(
  app: FrameLocator | Page,
  prompt: string,
): Promise<void> {
  const board = app.getByTestId('arrivals-board').last();
  if (prompt === DEMO_PROMPTS.near) {
    await board
      .getByTestId('arrivals-row')
      .nth(nearby.length - 1)
      .waitFor();
  } else if (prompt === DEMO_PROMPTS.arrivals) {
    await board
      .getByTestId('arrivals-row')
      .nth(arrivals.length - 1)
      .waitFor();
  } else {
    await app
      .locator(`[data-testid="flight-card"][data-hex="${fastest.hex}"]`)
      .waitFor();
  }
  await app.locator('.atc-transcript[aria-busy="false"]').waitFor();
}

/** Starts the scripted model and an atc server for the director and the app. */
async function startServers(directorDir: string): Promise<{
  readonly origin: string;
  close(): Promise<void>;
}> {
  // Small chunks with a little latency, so the answers visibly stream.
  const mock = new LLMock({ port: 0, chunkSize: 6, latency: 18 });
  scriptAtcModel(mock);
  await mock.start();
  const server: Server = createApp({
    run: {
      apiKey: 'demo-only',
      baseURL: `${mock.url}/v1`,
      model: 'gpt-5-mini',
    },
    statics: [
      { path: '/angular', dir: resolve(DIST, 'angular/browser') },
      { path: '/demo', dir: directorDir },
    ],
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
      await mock.stop();
    },
  };
}

/** Plays the storyboard through the director page, one scene per beat. */
async function recordDemo(context: BrowserContext, origin: string) {
  const page = await context.newPage();
  await page.setViewportSize(STAGE);
  await page.goto(`${origin}/demo/`);
  await page.waitForFunction(() => 'director' in window);
  await page.evaluate(() => document.fonts.ready);
  const app = page.frameLocator('iframe[name="app"]');
  await mapReady(app);
  // Let a few snapshots arrive, so planes are already gliding.
  await wait(7000);
  const take = await capture(page, join(WORK, 'demo-frames'), STAGE);
  await page.evaluate(() =>
    (
      window as unknown as { director: { reset(): Promise<void> } }
    ).director.reset(),
  );
  for (const [index, beat] of STORYBOARD.entries()) {
    await take.scene(beatSceneName(index, beat), async () => {
      await page.evaluate(
        (at) =>
          (
            window as unknown as {
              director: { play(i: number): Promise<void> };
            }
          ).director.play(at),
        index,
      );
      if (beat.kind !== 'app') return;
      if (beat.prompt !== null) {
        await ask(app, beat.prompt);
        await answered(app, beat.prompt);
        if (beat.then !== undefined) {
          await page.evaluate(
            (name) =>
              (
                window as unknown as {
                  director: { focus(n: string): Promise<void> };
                }
              ).director.focus(name),
            beat.then,
          );
        }
      }
      await wait(beat.holdMs);
    });
  }
  const timeline = await take.stop();
  await page.close();

  return timeline;
}

/** Records the home page loop: the app alone, answering the Seattle question. */
async function recordLoop(context: BrowserContext, origin: string) {
  const page = await context.newPage();
  await page.setViewportSize(LOOP);
  await page.goto(`${origin}/angular/`);
  await mapReady(page);
  await wait(7000);
  const take = await capture(page, join(WORK, 'loop-frames'), LOOP);
  await take.scene('loop', async () => {
    await wait(1200);
    await ask(page, DEMO_PROMPTS.arrivals);
    await answered(page, DEMO_PROMPTS.arrivals);
    await wait(3800);
  });
  const timeline = await take.stop();
  await page.close();

  return timeline;
}

/** Turns a capture into a constant-rate master clip. */
function master(
  timeline: Timeline,
  frames: string,
  name: string,
  size: { readonly width: number; readonly height: number },
): string {
  const list = join(WORK, `${name}.ffconcat`);
  writeFileSync(
    list,
    concatList(timeline.frames, frames, sceneSpan(timeline.scenes)),
  );
  const out = join(WORK, `${name}-master.mp4`);
  ffmpeg(masterArgs(list, out, size));

  return out;
}

/**
 * Converts a PNG to WebP in the browser (a canvas encodes WebP), so the
 * recorder needs no image tool besides ffmpeg, whose builds often lack WebP.
 */
async function toWebp(page: Page, png: string, out: string): Promise<void> {
  const dataUrl = `data:image/png;base64,${readFileSync(png).toString('base64')}`;
  const webp = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);

    return canvas.toDataURL('image/webp', 0.86);
  }, dataUrl);
  writeFileSync(out, Buffer.from(webp.split(',')[1], 'base64'));
}

/** Encodes web MP4 and WebM copies and a WebP poster at `posterAt` seconds. */
async function publish(
  page: Page,
  source: string,
  name: string,
  posterAt: number,
): Promise<void> {
  ffmpeg(mp4Args(source, join(OUT, `${name}.mp4`)));
  ffmpeg(webmArgs(source, join(OUT, `${name}.webm`)));
  const png = join(WORK, `${name}-poster.png`);
  ffmpeg(frameArgs(source, posterAt, png));
  await toWebp(page, png, join(OUT, `${name}-poster.webp`));
}

/** A contact sheet of the demo, one tile every 1.5 s, for review. */
function contactSheet(source: string, out: string): void {
  ffmpeg([
    '-i',
    source,
    '-vf',
    'fps=2/3,scale=480:-1,tile=6x6:padding=8:color=white',
    '-frames:v',
    '1',
    out,
  ]);
}

async function main(): Promise<void> {
  mkdirSync(WORK, { recursive: true });
  const files = Object.fromEntries(
    storyboardPaths().map((path) => [
      path,
      readFileSync(resolve(ATC, path), 'utf8'),
    ]),
  );
  const directorDir = join(WORK, 'director');
  mkdirSync(directorDir, { recursive: true });
  writeFileSync(
    join(directorDir, 'index.html'),
    renderDirector({
      files,
      wordmark: readFileSync(WORDMARK, 'utf8'),
      appUrl: '/angular/',
    }),
  );
  const servers = await startServers(directorDir);
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-position=-4000,0'],
  });
  try {
    const context = await browser.newContext({
      viewport: STAGE,
      deviceScaleFactor: 2,
      reducedMotion: 'no-preference',
    });
    await stubFeeds(context);
    const encoder = await context.newPage();
    const only = process.argv.includes('--loop-only')
      ? 'loop'
      : process.argv.includes('--demo-only')
        ? 'demo'
        : null;
    if (only !== 'loop') {
      const demo = await recordDemo(context, servers.origin);
      const source = master(demo, join(WORK, 'demo-frames'), 'demo', STAGE);
      // The poster: the near-Bend board, just before the tools beat.
      await publish(
        encoder,
        source,
        'atc-demo',
        sceneOffset(demo.scenes, beatSceneName(4, STORYBOARD[4])) - 0.2,
      );
      contactSheet(source, join(OUT, 'atc-demo-contact-sheet.png'));
      console.log(`demo: ${duration(join(OUT, 'atc-demo.mp4')).toFixed(1)} s`);
    }
    if (only !== 'demo') {
      const loop = await recordLoop(context, servers.origin);
      const raw = master(loop, join(WORK, 'loop-frames'), 'loop', LOOP);
      const seamless = join(WORK, 'loop-seamless.mp4');
      ffmpeg(loopArgs(raw, duration(raw), LOOP_FADE_S, seamless));
      await publish(encoder, seamless, 'atc-loop', 0);
      console.log(`loop: ${duration(join(OUT, 'atc-loop.mp4')).toFixed(1)} s`);
    }
    console.log(`Wrote ${OUT}`);
  } finally {
    await browser.close();
    await servers.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
