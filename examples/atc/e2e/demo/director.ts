import { ATC_MARK } from '@atc/shared';
import { APP_FOCUS, type Beat, type CodePane, STORYBOARD } from './storyboard';

/** Every motion duration the director page waits on, in ms. Holds live in the storyboard. */
export const DIRECTOR_TIMING = {
  wordStaggerMs: 45,
  wordRevealMs: 380,
  markDrawMs: 900,
  readMs: 700,
  dockMs: 420,
  swapMs: 550,
  cameraMs: 750,
  closeSweepMs: 750,
} as const;

/** The video's size in CSS pixels. */
export const STAGE = { width: 1440, height: 810 } as const;

/**
 * Lines a code pane shows: one pane fills the frame, two sit side by side at a
 * smaller size. A longer file shows a window around its focal line.
 */
export const CODE_PANE_LINES = { one: 19, two: 23 } as const;

/** Lines a window keeps below the focal line; the rest go above it. */
const CODE_CONTEXT_AFTER = { one: 6, two: 8 } as const;

/** How far back a window's start may move to reach a block boundary. */
const SNAP_BACK_LINES = 6;

/** The longest line a two-pane column asks room for; longer lines fade out. */
const TWO_PANE_MAX_NEED = 100;

type Density = keyof typeof CODE_PANE_LINES;

/** A line that opens a block: the first line, one after a blank line, or a doc comment. */
function opensBlock(lines: readonly string[], at: number): boolean {
  return (
    lines[at].trim() !== '' &&
    (at === 0 ||
      lines[at - 1].trim() === '' ||
      lines[at].trim().startsWith('/**'))
  );
}

/**
 * The start of a window of `size` lines that shows line `index`, moved to a
 * block boundary so a pane never opens mid-function: back up to
 * {@link SNAP_BACK_LINES} lines, else forward to the nearest boundary that
 * still leaves a line above the focal one, else unchanged.
 */
export function snapWindowStart(
  lines: readonly string[],
  start: number,
  index: number,
  size: number,
): number {
  for (let at = start; at >= Math.max(0, start - SNAP_BACK_LINES); at--) {
    if (opensBlock(lines, at) && index - at < size) return at;
  }
  for (let at = start + 1; at < index && at + size <= lines.length; at++) {
    if (opensBlock(lines, at)) return at;
  }

  return start;
}

/**
 * The start of a fixed-size window of `before + 1 + after` lines around
 * `index`, shifted (never shrunk) where the file starts or ends.
 */
export function windowStart(
  lineCount: number,
  index: number,
  before: number,
  after: number,
): number {
  if (!Number.isInteger(index) || index < 0 || index >= lineCount) {
    throw new RangeError(`index ${index} is outside the ${lineCount} lines`);
  }

  return Math.max(
    0,
    Math.min(index - before, lineCount - (before + 1 + after)),
  );
}

/** Escapes text for HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A copy of a pattern without `g` or `y`, so it never carries `lastIndex`. */
const stateless = (pattern: RegExp) =>
  new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));

/** One rendered code pane, with what its column needs in `ch`. */
interface RenderedPane {
  readonly html: string;
  readonly focalChars: number;
  readonly needChars: number;
}

/**
 * One pane: the file's single focal line found, the window chosen, and the
 * focal line wrapped as the beat's mark, with the matched part as the `hit`
 * the camera keeps in view.
 */
export function codePane(
  beatId: string,
  pane: CodePane,
  source: string | undefined,
  density: Density,
): RenderedPane {
  if (typeof source !== 'string') {
    throw new Error(`beat "${beatId}" needs ${pane.path}, which was not read`);
  }
  const focal = stateless(pane.focal);
  const all = source.replace(/\n$/, '').split('\n');
  const matches = all.flatMap((line, at) => (focal.test(line) ? [at] : []));
  if (matches.length !== 1) {
    throw new Error(
      `beat "${beatId}": ${matches.length} lines of ${pane.path} match ${pane.focal}; it must mark exactly one`,
    );
  }
  const [focalAt] = matches;
  const size = CODE_PANE_LINES[density];
  let lines = all;
  let focusIndex = focalAt;
  if (all.length > size) {
    const after = CODE_CONTEXT_AFTER[density];
    const start = windowStart(all.length, focalAt, size - 1 - after, after);
    const snapped = snapWindowStart(all, start, focalAt, size);
    lines = all.slice(snapped, snapped + size);
    focusIndex = focalAt - snapped;
  }
  const body = lines
    .map((line, at) => {
      if (at !== focusIndex) return escapeHtml(line);
      const match = focal.exec(line) as RegExpExecArray;
      // The hit leaves out surrounding whitespace, so a pattern anchored with
      // `^\s+` still frames the code, not its indent.
      const from =
        match.index + (match[0].length - match[0].trimStart().length);
      const to = match.index + match[0].trimEnd().length;
      const part = line.slice(from, to) !== line.trim() ? ' part' : '';

      return `<span class="focus">${escapeHtml(line.slice(0, from))}<span class="hit${part}">${escapeHtml(line.slice(from, to))}</span>${escapeHtml(line.slice(to))}</span>`;
    })
    .join('\n');

  return {
    html: `<section class="pane"><div class="strip">${escapeHtml(pane.path)}</div><pre>${body}</pre></section>`,
    focalChars: all[focalAt].trimEnd().length + 1,
    needChars: Math.min(
      TWO_PANE_MAX_NEED,
      Math.max(...lines.map((line) => line.trimEnd().length)) + 1,
    ),
  };
}

/**
 * Two panes share the frame by what their visible lines need, and neither
 * column narrows below its focal line, so the marked line is always whole.
 */
export function twoPaneColumns(panes: readonly RenderedPane[]): string {
  return panes
    .map(
      (pane) =>
        `minmax(calc(${pane.focalChars}ch + 40px), ${pane.needChars}fr)`,
    )
    .join(' ');
}

function codeLayer(
  beat: Extract<Beat, { kind: 'code' }>,
  files: Readonly<Record<string, string>>,
): string {
  const density: Density = beat.panes.length === 2 ? 'two' : 'one';
  const panes = beat.panes.map((pane) =>
    codePane(beat.id, pane, files[pane.path], density),
  );
  const columns =
    density === 'two'
      ? ` style="grid-template-columns: ${twoPaneColumns(panes)}"`
      : '';

  return `<div class="layer code${density === 'two' ? ' two' : ''}" data-layer="${beat.id}"${columns}>${panes.map((pane) => pane.html).join('')}</div>`;
}

/** Words that rise one by one, each in its own clipped box; `from` offsets the stagger. */
function revealWords(text: string, from = 0): string {
  return text
    .split(' ')
    .map(
      (word, index) =>
        `<span class="w"><span style="transition-delay:${(from + index) * DIRECTOR_TIMING.wordStaggerMs}ms">${escapeHtml(word)}</span></span>`,
    )
    .join('');
}

/** The ATC lettermark, each stroke ready to draw itself. */
function atcMarkSvg(): string {
  const paths = ATC_MARK.paths
    .map(
      (d, index) =>
        `<path d="${d}" pathLength="1" style="transition-delay:${index * 140}ms"/>`,
    )
    .join('');

  return `<svg class="mark" viewBox="${ATC_MARK.viewBox}" width="${ATC_MARK.width * 1.6}" height="${ATC_MARK.height * 1.6}" fill="none" stroke="currentColor" stroke-width="${ATC_MARK.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** JSON that is safe inside an inline script. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

const STYLE = `
:root {
  --paper: #faf9f0; --ink: #3d3c3a; --brown: #774625; --muted: #5e5c5a; --rule: #ad907c; --dots: #e9e1cf;
  --panel: #231c17; --panel-strip: #2f261f; --panel-ink: #faf9f0; --panel-dim: #9c8f84; --panel-rule: #4a3e35;
  --gold: #fbbb52; --gold-wash: rgb(251 187 82 / 0.16);
  --ease-out: cubic-bezier(.16, 1, .3, 1); --ease-in-out: cubic-bezier(.65, 0, .35, 1);
}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1440px; height: 810px; overflow: hidden; background: var(--paper); color: var(--ink); font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif; }
.stage { position: relative; width: 1440px; height: 810px; overflow: clip; background: radial-gradient(circle at 12px 12px, var(--dots) 1.2px, transparent 1.6px) 0 0 / 24px 24px, var(--paper); }
.instant, .instant * { transition: none !important; }
.w { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.06em; margin-right: 0.22em; }
.w:last-child { margin-right: 0; }
.w > span { display: inline-block; transform: translateY(105%); transition: transform var(--reveal) var(--ease-out); }
.revealed .head .w > span, .titled .title .w > span, .close-revealed .close .w > span { transform: none; }
.title { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 40px; pointer-events: none; transition: opacity var(--swap) var(--ease-in-out), filter var(--swap) var(--ease-in-out), transform var(--swap) var(--ease-in-out); }
.title .mark { color: var(--brown); }
.title .mark path { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset var(--draw) var(--ease-in-out); }
.titled .title .mark path { stroke-dashoffset: 0; }
.title .sub { font-weight: 600; font-size: 38px; line-height: 1.2; letter-spacing: -0.02em; color: var(--muted); white-space: nowrap; }
.untitled .title { opacity: 0; filter: blur(6px); transform: scale(0.98); }
.head { position: absolute; left: 163px; top: 44px; font-weight: 800; font-size: 88px; line-height: 1.06; letter-spacing: -0.03em; color: var(--brown); transform-origin: 0 0; transform: translateY(300px); transition: transform var(--dock) var(--ease-out); white-space: nowrap; }
.docked .head { transform: scale(0.42); }
.roll { overflow: hidden; height: 1.12em; }
.lines { transition: transform var(--swap) var(--ease-in-out); }
.lines > div { height: 1.12em; overflow: hidden; transition: opacity calc(var(--swap) * 0.5) var(--ease-out); }
.rolling .lines > div:first-child:not(:last-child) { opacity: 0; }
.rolling .lines { transform: translateY(-1.12em); }
.frame { position: absolute; left: 163px; top: 128px; width: 1113px; height: 626px; overflow: clip; border-radius: 14px; outline: 1.5px solid var(--rule); background: var(--panel); transform: translateY(820px); transition: transform var(--dock) var(--ease-out); }
.docked .frame, .prep .frame { transform: none; }
.camera { position: absolute; inset: 0; transform-origin: 0 0; transform: translate(0px, 0px) scale(1); transition: transform var(--camera) var(--ease-in-out); }
.layer { position: absolute; inset: 0; opacity: 0; filter: blur(6px); transform: scale(1.03); transition: opacity var(--swap) var(--ease-in-out), filter var(--swap) var(--ease-in-out), transform var(--swap) var(--ease-in-out); }
.layer.on { opacity: 1; filter: none; transform: none; }
.layer:not(.on) { pointer-events: none; }
.code { display: grid; grid-template-columns: 1fr; }
.pane { min-width: 0; overflow: clip; }
.pane + .pane { border-left: 1px solid var(--panel-rule); }
.strip { height: 40px; padding: 11px 24px; background: var(--panel-strip); color: var(--panel-dim); font: 400 14px/18px 'JetBrains Mono', ui-monospace, monospace; white-space: nowrap; overflow: hidden; }
pre { padding: 24px; color: var(--panel-ink); font: 400 17px/1.65 'JetBrains Mono', ui-monospace, monospace; font-variant-ligatures: none; white-space: pre; overflow: hidden; transition: color var(--swap) var(--ease-out); }
.two pre { padding: 24px 20px; font-size: 14px; line-height: 1.65; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent); }
.two .strip { padding: 11px 20px; }
.focus { position: relative; z-index: 0; }
.focus::before { content: ''; position: absolute; left: -24px; right: -2000px; top: -2px; bottom: -2px; background: var(--gold-wash); box-shadow: inset 3px 0 0 var(--gold); transform: scaleX(0); transform-origin: 0 50%; transition: transform var(--swap) var(--ease-out); z-index: -1; }
.two .focus::before { left: -20px; }
.marked .focus::before { transform: none; }
.focus, .hit { transition: color var(--swap) var(--ease-out); }
.marked pre { color: var(--panel-dim); }
.marked .focus { color: var(--panel-ink); }
.marked .focus:has(> .hit.part) { color: var(--panel-dim); }
.marked .hit { color: var(--panel-ink); }
.hit.part { text-decoration: underline 2px transparent; text-underline-offset: 5px; transition: text-decoration-color var(--swap) var(--ease-out); }
.marked .hit.part { text-decoration-color: var(--gold); }
.app { background: var(--paper); }
.app iframe { position: absolute; left: 0; top: 0; width: 1440px; height: 810px; border: 0; transform: scale(${1113 / 1440}); transform-origin: 0 0; }
.close { position: absolute; inset: 0; z-index: 4; display: grid; place-content: center; justify-items: center; gap: 36px; background: radial-gradient(circle at 12px 12px, var(--dots) 1.2px, transparent 1.6px) 0 0 / 24px 24px, var(--paper); clip-path: inset(0 0 0 100%); transition: clip-path var(--sweep) var(--ease-in-out); }
.closing .close { clip-path: inset(0 0 0 0); }
.close .wordmark { width: 420px; height: auto; }
.close .tagline { font-weight: 800; font-size: 64px; line-height: 1.06; letter-spacing: -0.03em; color: var(--brown); white-space: nowrap; }
.close .command { padding: 18px 26px; border-radius: 12px; background: var(--panel); color: var(--panel-ink); font: 400 22px/1 'JetBrains Mono', ui-monospace, monospace; }
.close .command::before { content: '$ '; color: var(--gold); }
.sweep { visibility: hidden; position: absolute; top: 0; bottom: 0; left: 1440px; width: 2px; z-index: 5; background: var(--rule); transition: left var(--sweep) var(--ease-in-out); }
.sweep::after { content: ''; position: absolute; left: -11px; top: 394px; width: 24px; height: 24px; border-radius: 50%; background: var(--gold); }
.closing .sweep { left: 0; visibility: visible; }
.swept .sweep { visibility: hidden; }
`;

/**
 * The page's runtime, as a script string. The camera always moves by
 * `translate(x, y) scale(s)` with a fixed origin, so any move between two
 * framings is one continuous ease.
 */
const runtime = (
  timing: typeof DIRECTOR_TIMING,
  beats: readonly unknown[],
  presets: typeof APP_FOCUS,
) => `
(() => {
  const T = ${scriptJson(timing)}, BEATS = ${scriptJson(beats)}, FOCUS = ${scriptJson(presets)}
  const stage = document.querySelector('.stage')
  const roll = stage.querySelector('.roll')
  const lines = stage.querySelector('.lines')
  const camera = stage.querySelector('.camera')
  const MARGIN = 48, CODE_ZOOM = { one: 1.35, two: 1 }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high)
  for (const [name, value] of [['--dock', T.dockMs], ['--swap', T.swapMs], ['--reveal', T.wordRevealMs], ['--camera', T.cameraMs], ['--sweep', T.closeSweepMs], ['--draw', T.markDrawMs]]) {
    stage.style.setProperty(name, value + 'ms')
  }
  let docked = false
  function words(text) {
    const line = document.createElement('div')
    text.split(' ').forEach((word, index) => {
      const outer = document.createElement('span'); outer.className = 'w'
      const inner = document.createElement('span'); inner.textContent = word
      inner.style.transitionDelay = index * T.wordStaggerMs + 'ms'
      outer.append(inner); line.append(outer)
    })
    return line
  }
  const revealMs = (count) => T.wordRevealMs + (count - 1) * T.wordStaggerMs
  const layerOf = (beat) => stage.querySelector('[data-layer="' + (beat.kind === 'app' ? 'app' : beat.id) + '"]')
  function show(layer) {
    for (const element of stage.querySelectorAll('.layer')) {
      const on = element === layer
      if (!on && element.classList.contains('on')) {
        setTimeout(() => { if (!element.classList.contains('on')) element.classList.remove('marked') }, T.swapMs)
      }
      element.classList.toggle('on', on)
    }
  }
  async function cameraTo({ s, x, y }) {
    camera.style.transform = 'translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px) scale(' + s + ')'
    await wait(T.cameraMs)
  }
  function presetFraming(name) {
    const preset = FOCUS[name]
    if (preset === undefined) throw new Error('unknown focus ' + name)
    const [ox, oy] = preset.origin.split(' ').map((part) => parseFloat(part) / 100)
    const s = preset.scale
    return { s, x: ox * camera.offsetWidth * (1 - s), y: oy * camera.offsetHeight * (1 - s) }
  }
  function focalFraming(layer) {
    const box = layer.getBoundingClientRect(), k = layer.offsetWidth / box.width
    const W = camera.offsetWidth, H = camera.offsetHeight
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const hit of layer.querySelectorAll('.hit')) {
      const r = hit.getBoundingClientRect(), pane = hit.closest('.pane').getBoundingClientRect()
      x0 = Math.min(x0, (pane.left - box.left) * k); x1 = Math.max(x1, (r.right - box.left) * k)
      y1 = Math.max(y1, (r.bottom - box.top) * k)
    }
    const zoom = layer.classList.contains('two') ? CODE_ZOOM.two : CODE_ZOOM.one
    const s = Math.max(1, Math.min(zoom, (W - MARGIN) / (x1 - x0), (H - MARGIN) / y1))
    return {
      s,
      x: clamp(Math.min(0, W - MARGIN - s * x1), -s * x0, 0),
      y: clamp(Math.min(0, H - MARGIN - s * y1), H - s * H, 0),
    }
  }
  async function rollTo(text) {
    lines.append(words(text))
    roll.classList.add('rolling')
    await wait(T.swapMs)
    roll.classList.add('instant')
    lines.firstElementChild.remove()
    roll.classList.remove('rolling')
    await frame()
    roll.classList.remove('instant')
  }
  function frameBeat(beat, layer) {
    if (beat.kind === 'app') return cameraTo(presetFraming(beat.focus))
    layer.classList.add('marked')
    return cameraTo(focalFraming(layer))
  }
  async function dock(beat, layer) {
    stage.classList.add('untitled')
    await wait(T.swapMs / 2)
    lines.replaceChildren(words(beat.headline))
    await frame()
    stage.classList.add('revealed')
    await wait(revealMs(beat.headline.split(' ').length) + T.readMs)
    show(layer)
    stage.classList.add('docked')
    docked = true
    await wait(T.dockMs)
    await frameBeat(beat, layer)
  }
  /**
   * Plays one beat. Resolves when its motion has settled plus its hold, except
   * an app beat, which resolves once its motion has settled: the recorder then
   * performs the beat's action in the app and holds itself.
   */
  async function play(index) {
    const beat = BEATS[index]
    if (beat === undefined) throw new Error('unknown beat ' + index)
    if (beat.kind === 'title') {
      stage.classList.add('titled')
      await wait(Math.max(T.markDrawMs + 280, revealMs(stage.querySelectorAll('.title .w').length)) + beat.holdMs)
      return
    }
    if (beat.kind === 'close') {
      stage.classList.add('closing')
      await wait(T.closeSweepMs)
      stage.classList.add('swept', 'close-revealed')
      await wait(revealMs(beat.headline.split(' ').length) + beat.holdMs)
      return
    }
    const layer = layerOf(beat)
    if (!docked) {
      await dock(beat, layer)
    } else {
      const rolled = rollTo(beat.headline)
      show(layer)
      await wait(T.swapMs / 2)
      await Promise.all([rolled, frameBeat(beat, layer)])
    }
    if (beat.kind === 'code') await wait(beat.holdMs)
  }
  async function focus(name) {
    await cameraTo(presetFraming(name))
  }
  /** Leaves the preparation state for the opening frame, with no motion. */
  async function reset() {
    stage.classList.add('instant')
    stage.classList.remove('prep')
    show(null)
    camera.style.transform = 'translate(0px, 0px) scale(1)'
    await frame()
    stage.classList.remove('instant')
    await frame()
  }
  window.director = { ready: true, reset, play, focus }
})()
`;

/**
 * The director page: the title card, a code layer per code beat, one shared
 * app iframe layer (last, so it takes clicks), the close card and the sweep.
 * `files` maps each storyboard path to its source; `wordmark` is the
 * hashbrown wordmark SVG; `appUrl` is what the iframe loads. The page starts
 * in the preparation state (the frame in place, the app showing) so the
 * recorder can load the app first; `director.reset()` then moves to the
 * opening frame, and `director.play(index)` plays a beat.
 */
export function renderDirector(options: {
  readonly files: Readonly<Record<string, string>>;
  readonly wordmark: string;
  readonly appUrl: string;
  readonly storyboard?: readonly Beat[];
}): string {
  const storyboard = options.storyboard ?? STORYBOARD;
  const layers = storyboard.flatMap((beat) =>
    beat.kind === 'code' ? [codeLayer(beat, options.files)] : [],
  );
  const title = storyboard.find((beat) => beat.kind === 'title');
  const close = storyboard.find((beat) => beat.kind === 'close');
  if (title?.kind !== 'title' || close?.kind !== 'close') {
    throw new Error('the storyboard needs a title beat and a close beat');
  }
  const beats = storyboard.map((beat) => ({
    id: beat.id,
    kind: beat.kind,
    headline: beat.headline,
    holdMs: beat.holdMs,
    ...(beat.kind === 'app' ? { focus: beat.focus } : {}),
  }));
  const wordmark = options.wordmark
    .replace(/<\?xml[^>]*>/, '')
    .replace('<svg ', '<svg class="wordmark" ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>atc demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;800&family=JetBrains+Mono:wght@400&display=block" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div class="stage prep">
  <div class="title">${atcMarkSvg()}<div class="sub">${revealWords(title.subtitle, 4)}</div></div>
  <h1 class="head"><div class="roll"><div class="lines"></div></div></h1>
  <div class="frame"><div class="camera">
    ${layers.join('\n    ')}
    <div class="layer app on" data-layer="app"><iframe name="app" src="${escapeHtml(options.appUrl)}" title="atc"></iframe></div>
  </div></div>
  <div class="close">${wordmark}<div class="tagline">${revealWords(close.headline)}</div><div class="command">${escapeHtml(close.command)}</div></div>
  <div class="sweep"></div>
</div>
<script>${runtime(DIRECTOR_TIMING, beats, APP_FOCUS)}</script>
</body>
</html>`;
}
