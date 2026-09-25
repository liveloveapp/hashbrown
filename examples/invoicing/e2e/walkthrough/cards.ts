import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { capture } from './capture';
import type { Timeline } from './timeline';

const VIEWPORT = { width: 1440, height: 810 };

async function card(page: Page, html: string, dir: string, seconds: number) {
  await page.setContent('<body style="background:#faf9f0"></body>');
  const rec = await capture(page, dir);
  rec.mark(1, 'card');
  await page.setContent(html, { waitUntil: 'networkidle' });
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return rec.stop();
}

/**
 * Record the animated title and end cards, in the site's palette and with
 * its logo, and render the fast-forward chip the build overlays on sped-up
 * spans. `logos` is the site's logo directory.
 */
export async function recordCards(
  browser: Browser,
  logos: string,
  dir: string,
): Promise<{ title: Timeline; end: Timeline; chip: string }> {
  const mark = await readFile(join(logos, 'brand-mark.svg'), 'utf8');
  const word = await readFile(join(logos, 'word-mark.svg'), 'utf8');
  const base = `
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: #faf9f0; color: #3d3c3a; font-family: 'Poppins', sans-serif;
      display: grid; place-items: center; position: relative; }
    .blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; }
    .b1 { width: 620px; height: 620px; background: #fbbb52; left: -160px; top: -200px; animation: drift 6s ease-in-out infinite alternate; }
    .b2 { width: 520px; height: 520px; background: #9ecfd7; right: -140px; bottom: -220px; animation: drift 7s ease-in-out infinite alternate-reverse; }
    .b3 { width: 360px; height: 360px; background: #f6d1b8; right: 22%; top: -160px; animation: drift 5s ease-in-out infinite alternate; }
    @keyframes drift { to { transform: translate(60px, 40px) scale(1.08); } }
    .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(61,60,58,.05) 1px, transparent 1px);
      background-size: 18px 18px; }
    .stack { position: relative; display: grid; justify-items: center; text-align: center; }
    .in { opacity: 0; transform: translateY(26px); animation: rise 800ms cubic-bezier(.2,.8,.2,1) forwards; }
    @keyframes rise { to { opacity: 1; transform: none; } }
    .pop { opacity: 0; transform: scale(.6) rotate(-8deg); animation: pop 900ms cubic-bezier(.2,1.4,.3,1) forwards; }
    @keyframes pop { to { opacity: 1; transform: none; } }
    .mark svg { width: 118px; height: auto; display: block; }
    .word svg { width: 300px; height: auto; display: block; }
    .kicker { font-family: 'JetBrains Mono', monospace; font-size: 15px; letter-spacing: .14em; text-transform: uppercase;
      color: #774625; background: rgba(251,187,82,.28); padding: 7px 14px; border-radius: 999px; }
    h1 { font-size: 64px; line-height: 1.05; letter-spacing: -.035em; font-weight: 700; }
    h1 em { font-style: normal; background: linear-gradient(90deg, #e8a23d, #e88c4d); -webkit-background-clip: text; color: transparent; }
    p.sub { font-size: 22px; color: #5e5c5a; }
    .chips { display: flex; gap: 10px; }
    .chip { font-size: 16px; font-weight: 500; padding: 8px 16px; border-radius: 999px; background: #fff;
      box-shadow: 0 1px 0 rgba(61,60,58,.08), inset 0 0 0 1px rgba(61,60,58,.1); }
    .url { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 500; color: #fff;
      background: #3d3c3a; padding: 14px 26px; border-radius: 16px; box-shadow: 0 16px 40px rgba(61,60,58,.25); }
  </style>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grain"></div>`;

  const title = `${base}
  <div class="stack" style="gap:22px">
    <div class="mark pop" style="animation-delay:100ms">${mark}</div>
    <div class="kicker in" style="animation-delay:450ms">Invoicing example · walkthrough</div>
    <h1 class="in" style="animation-delay:620ms">A chat that <em>drives</em><br>the app</h1>
    <p class="sub in" style="animation-delay:820ms">Streaming generative UI with hashbrown</p>
  </div>`;

  const end = `${base}
  <div class="stack" style="gap:26px">
    <div class="pop" style="display:flex;align-items:center;gap:18px;animation-delay:80ms">
      <div class="mark">${mark.replace('<svg', '<svg style="width:84px"')}</div>
      <div class="word">${word}</div>
    </div>
    <h1 class="in" style="animation-delay:380ms;font-size:54px">Build <em>generative UI</em> you can trust</h1>
    <div class="chips in" style="animation-delay:560ms">
      <span class="chip">React &amp; Angular</span><span class="chip">Streaming</span>
      <span class="chip">Your components only</span><span class="chip">Open source</span>
    </div>
    <div class="url in" style="animation-delay:760ms">hashbrown.dev</div>
  </div>`;

  const page = await browser.newPage({ viewport: VIEWPORT });
  const titleTimeline = await card(page, title, join(dir, 'title'), 3.4);
  const endTimeline = await card(page, end, join(dir, 'end'), 4.2);
  await page.close();

  // Drawn at output scale and captured on a transparent background.
  const chipPage = await browser.newPage({
    viewport: { width: 400, height: 120 },
  });
  await chipPage.setContent(
    `
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap" rel="stylesheet">
<style>html,body{background:transparent;margin:0}
.c{display:inline-flex;align-items:center;gap:10px;margin:10px;padding:10px 18px 10px 14px;border-radius:999px;
font:600 20px Poppins,sans-serif;color:#3d3c3a;background:rgba(251,187,82,.96);box-shadow:0 10px 30px rgba(61,60,58,.25)}
.c svg{width:22px;height:22px}</style>
<div class="c" id="c"><svg viewBox="0 0 24 24"><path fill="#3d3c3a" d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/></svg>Fast-forward</div>`,
    { waitUntil: 'networkidle' },
  );
  const chip = join(dir, 'chip.png');
  await chipPage
    .locator('#c')
    .screenshot({ path: chip, omitBackground: true, scale: 'css' });
  await chipPage.close();
  return { title: titleTimeline, end: endTimeline, chip };
}
