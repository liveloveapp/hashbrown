// Records the invoicing walkthrough video for hashbrown.dev/samples.
//
//   INVOICING_ENV_FILE=.env npx nx walkthrough invoicing-e2e [-- --reuse-servers]
//
// Needs ffmpeg with libx264 on PATH and an OpenAI key (OPENAI_API_KEY or
// INVOICING_ENV_FILE), because the assistant answers live. It starts the
// agent server and the React app unless they are already running, drives
// the app in a headed Chrome parked off-screen (on a Retina display that
// captures physical pixels for a sharp 1080p), then writes the video to
// test-results (never committed) and its poster into www/public. With
// BLOB_READ_WRITE_TOKEN (the hashbrown-www-media store's token) and
// VERCEL_TOKEN set, it uploads the video to Vercel Blob under a
// content-hashed name and prints the URL to put in
// www/src/components/samples/walkthrough.ts. Answers come from a live model,
// so every run differs a little; watch the video before publishing it.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { assemble, duration, frameAt } from './assemble';
import { recordCards } from './cards';
import { recordApp } from './scenes';

const ROOT = resolve(__dirname, '../../../..');
const WORK = join(ROOT, 'test-results/examples/invoicing-walkthrough');
const VIDEO = join(WORK, 'invoicing-walkthrough.mp4');
const POSTER = join(
  ROOT,
  'www/public/image/landing-page/invoicing-walkthrough.webp',
);
const AGENT = 'http://127.0.0.1:4325/healthz';
const APP = 'http://localhost:4326/';

const up = async (url: string) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

async function waitFor(url: string, child: ChildProcess) {
  for (let i = 0; i < 120; i += 1) {
    if (await up(url)) return;
    if (child.exitCode !== null)
      throw new Error(`${url} exited before it started`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not start`);
}

// Another checkout's servers may hold these ports; recording them would
// capture that checkout's app. Reuse only when asked.
const REUSE = process.argv.includes('--reuse-servers');

/** Start a server, or reuse one at `url` when --reuse-servers is passed. */
async function ensure(url: string, command: string, args: string[]) {
  if (await up(url)) {
    if (REUSE) return undefined;
    throw new Error(
      `${url} is already in use. Stop the running invoicing servers, or pass --reuse-servers if they serve this checkout.`,
    );
  }
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  await waitFor(url, child);
  return child;
}

/**
 * Upload the video to Vercel Blob under a content-hashed pathname, so every
 * recording gets its own immutable URL, or print the command when no token
 * is set.
 */
async function publish(video: string) {
  const hash = createHash('sha256')
    .update(await readFile(video))
    .digest('hex')
    .slice(0, 12);
  const args = [
    'blob',
    'put',
    video,
    '--access',
    'public',
    '--pathname',
    `video/invoicing-walkthrough-${hash}.mp4`,
    '--cache-control-max-age',
    '31536000',
  ];
  // The CLI needs the store's token and a Vercel login; without both it
  // would wait on an interactive device login.
  const blob = process.env['BLOB_READ_WRITE_TOKEN'];
  const vercel = process.env['VERCEL_TOKEN'];
  if (!blob || !vercel) {
    console.log(
      `Not uploaded. To publish: npx vercel ${args.join(' ')} --rw-token "$BLOB_READ_WRITE_TOKEN" --token "$VERCEL_TOKEN"`,
    );
    return;
  }
  execFileSync(
    join(ROOT, 'node_modules/.bin/vercel'),
    [...args, '--rw-token', blob, '--token', vercel],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  console.log(
    'Set WALKTHROUGH_VIDEO_URL in www/src/components/samples/walkthrough.ts to the URL above.',
  );
}

async function main() {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  const bin = (name: string) => join(ROOT, 'node_modules/.bin', name);
  const servers = [
    await ensure(AGENT, bin('tsx'), [
      '--tsconfig',
      'examples/invoicing/server/tsconfig.json',
      'examples/invoicing/server/src/main.ts',
    ]),
    await ensure(APP, bin('vite'), [
      '--config',
      'examples/invoicing/react/vite.config.mts',
    ]),
  ];
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-position=-4000,0'],
  });
  try {
    await rm(WORK, { recursive: true, force: true });
    await mkdir(WORK, { recursive: true });
    const cards = await recordCards(
      browser,
      join(ROOT, 'www/public/image/logo'),
      WORK,
    );
    const app = await recordApp(browser, APP, join(WORK, 'app'));
    const { appOffset } = assemble(
      WORK,
      { title: cards.title, app, end: cards.end },
      VIDEO,
    );

    // Poster: the finished title card, just before it crossfades away.
    const at = appOffset - 0.15;
    const still = join(WORK, 'poster.png');
    frameAt(VIDEO, at, still);
    await sharp(still)
      .resize({ width: 1600 })
      .webp({ quality: 72 })
      .toFile(POSTER);
    console.log(
      `Wrote ${VIDEO} (${duration(VIDEO).toFixed(1)}s) and ${POSTER}`,
    );
    await publish(VIDEO);
  } finally {
    await browser.close();
    for (const server of servers) server?.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
