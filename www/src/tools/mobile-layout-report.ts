/**
 * Layout report (part of the site's `e2e` target): renders a sample of every
 * page type at phone, tablet, landscape and desktop sizes and fails on
 * sideways scroll, clipped content, small touch targets, small text, fields
 * that make iOS zoom, controls drawn over in the open mobile menu, controls
 * left under the floating announcement at the end of a page, and page edges
 * (logo, header controls, first heading, sidebar, footer) off the gutter.
 * Run after a build: `npx nx e2e www`.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import {
  LAYOUT_VIEWPORTS,
  type LayoutIssue,
  layoutIssues,
  type LayoutSnapshot,
  PHONE_MAX_WIDTH,
} from '../lib/mobile-layout';
import { repoRoot } from '../lib/repo-root';

const PORT = 4391;
const ORIGIN = `http://localhost:${PORT}`;

/** One page per layout: marketing, blog, docs (tables, tabs, code), API. */
const PAGES = [
  '/',
  '/blog',
  '/blog/2026-10-10-building-atc',
  '/brand',
  '/privacy',
  '/unstuck',
  '/api',
  '/api/react/useUiChat',
  '/docs/react/start/quick',
  '/docs/react/platform/openai',
  '/docs/react/migrations/v0-7',
  '/docs/react/concept/components',
  '/docs/angular/start/quick',
  '/docs/angular/concept/structured-output',
];

/** Pages the open mobile menu is checked on: it opens on their menu. */
const MENU_PAGES = ['/docs/react/start/quick', '/api'];

type Measured = Omit<
  LayoutSnapshot,
  'page' | 'viewport' | 'covered' | 'gutter' | 'edges'
>;

/** Runs in the browser: measures the page for {@link layoutIssues}. */
function measure(): Measured {
  const vw = document.documentElement.clientWidth;
  const label = (el: Element) => {
    const name =
      el.getAttribute('aria-label') ??
      (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
    const cls =
      typeof el.className === 'string'
        ? el.className.split(' ')[0].replace(/^[\w-]{6}_/, '')
        : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${name ? ` "${name}"` : ''}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.right > 0 &&
      r.left < vw &&
      s.visibility !== 'hidden' &&
      !el.closest('[aria-hidden="true"], [inert]')
    );
  };
  const inlineLink = (el: Element) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') {
      return false;
    }
    let block = el.parentElement;
    while (block && getComputedStyle(block).display.startsWith('inline')) {
      block = block.parentElement;
    }
    // Inline in prose, even alone in its paragraph or list item; a link
    // the page lays out as a block or flex item is a target of its own.
    const own = (el.textContent ?? '').trim().length;
    return (
      !!block?.matches('p, li, td, th, dd, blockquote') ||
      (block?.textContent ?? '').trim().length > own
    );
  };
  const unique = <T extends { label: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.label, item])).values(),
  ];

  const clipped: Measured['clipped'][number][] = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el) || /^(absolute|fixed)$/.test(getComputedStyle(el).position)) {
      continue;
    }
    const r = el.getBoundingClientRect();
    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const style = getComputedStyle(p);
      const overflow = style.overflowX;
      // Inside something fixed to the window (the table of contents), which
      // its overflow-hidden ancestors don't clip.
      if (style.position === 'fixed') break;
      if (overflow === 'auto' || overflow === 'scroll') break;
      if (overflow === 'hidden' || overflow === 'clip') {
        const edge = Math.min(p.getBoundingClientRect().right, vw);
        if (r.left < edge) {
          clipped.push({
            label: label(el),
            right: Math.round(r.right),
            edge: Math.round(edge),
          });
        }
        break;
      }
    }
  }

  const targets = [
    ...document.querySelectorAll(
      'a, button, input, select, textarea, summary, [role="button"], [role="tab"]',
    ),
  ]
    // Links inside running text or code are exempt (WCAG 2.5.8 inline exception).
    .filter((el) => visible(el) && !inlineLink(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { label: label(el), width: r.width, height: r.height };
    });

  const texts: Measured['texts'][number][] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || !node.textContent?.trim() || !visible(el)) continue;
    const block = el.closest('pre, code, [class]') ?? el;
    texts.push({
      label: label(block),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
    });
  }

  const inputs = [...document.querySelectorAll('input, textarea, select')]
    .filter(
      (el) =>
        visible(el) &&
        !['hidden', 'checkbox', 'radio'].includes(
          (el as HTMLInputElement).type,
        ),
    )
    .map((el) => ({
      label: label(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
    }));

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clipped: unique(clipped),
    targets: unique(targets),
    texts: unique(texts),
    inputs: unique(inputs),
  };
}

/**
 * Runs in the browser: the page's gutter and how far in each page edge
 * starts. `root` scopes the search, e.g. to the open mobile menu.
 */
function edges(root: string | null): Pick<LayoutSnapshot, 'gutter' | 'edges'> {
  const scope = root ? document.querySelector(root) : document.body;
  const vw = document.documentElement.clientWidth;
  const gutter = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--gutter'),
  );
  const firstText = (el: Element | null | undefined) => {
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width) return { rect: r, el: node.parentElement as Element };
    }
    return null;
  };
  // The column an element sits in: its nearest scroller, else the window.
  const column = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        const r = p.getBoundingClientRect();
        return { left: r.left, right: r.left + p.clientWidth, el: p };
      }
    }
    return { left: 0, right: vw, el: document.body };
  };
  // A box narrower than its parent with equal room either side is centred,
  // and its content is placed by the centring, not the gutter.
  const centred = (el: Element, stop: Element) => {
    for (let a = el.parentElement; a && a !== stop; a = a.parentElement) {
      const p = a.parentElement;
      if (!p) break;
      const s = getComputedStyle(p);
      const pr = p.getBoundingClientRect();
      const left = pr.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
      const right = pr.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
      const r = a.getBoundingClientRect();
      if (
        r.width < right - left - 2 &&
        r.left - left > 1 &&
        Math.abs(r.left - left - (right - r.right)) <= 1
      ) {
        return true;
      }
    }
    return false;
  };
  const visible = (el: Element | null | undefined): el is Element =>
    !!el && el.getBoundingClientRect().width > 0;
  const header = scope?.querySelector('header, [class*="_header"]');
  const logo = header?.querySelector('a svg, a img');
  const controls = [...(header?.querySelectorAll('a, button') ?? [])].filter(visible);
  // The open menu's close button floats over its header row.
  const end = root
    ? scope?.querySelector('button[aria-label="Close menu"]')
    : controls.at(-1);
  const endIcon = end?.querySelector('svg') ?? end;
  const h1 = [...(scope?.querySelectorAll('h1') ?? [])].find(visible);
  const side = root
    ? null
    : document.querySelector('main[class*="_grid"] > [class*="_menu"]');
  const footer = root ? null : document.querySelector('footer');

  const found: LayoutSnapshot['edges'][number][] = [];
  const left = (
    label: string,
    el: Element | null | undefined,
    box: DOMRect | null | undefined,
    from = el ? column(el) : null,
  ) => {
    if (!el || !box || !from || centred(el, from.el)) return;
    found.push({ label, inset: box.left - from.left });
  };
  if (visible(logo)) left('logo', logo, logo.getBoundingClientRect());
  if (visible(endIcon) && !centred(endIcon, document.body)) {
    found.push({
      label: `header end "${end?.getAttribute('aria-label') ?? end?.textContent?.trim()}"`,
      inset: column(endIcon).right - endIcon.getBoundingClientRect().right,
    });
  }
  // The heading's box, not its text, which may be centred in it.
  if (h1) {
    left(`h1 "${h1.textContent?.trim().slice(0, 24)}"`, h1, h1.getBoundingClientRect());
  }
  // The first heading or link row; the framework picker above it is a
  // bordered control, so its text sits inside its box.
  const row = [...(side?.querySelectorAll('h2, summary, a, li > button') ?? [])].find(
    visible,
  );
  const rowText = firstText(row);
  if (side && rowText) {
    // From the sidebar column, not the menu scroller inside its padding.
    const r = side.getBoundingClientRect();
    left('sidebar', rowText.el, rowText.rect, {
      left: r.left,
      right: r.right,
      el: document.body,
    });
  }
  const footerText = visible(footer) ? firstText(footer) : null;
  left('footer', footerText?.el, footerText?.rect);
  return { gutter, edges: found };
}

/** Runs in the browser: controls in the open menu that something covers. */
function coveredInMenu(): LayoutSnapshot['covered'] {
  const panel = document.querySelector('[role="dialog"]');
  if (!panel) return [{ label: 'mobile menu', by: 'nothing: it did not open' }];
  return [...panel.querySelectorAll('a, button, input')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (!r.width || y < 0 || y > innerHeight || x < 0 || x > innerWidth)
        return null;
      const top = document.elementFromPoint(x, y);
      return top && !panel.contains(top)
        ? {
            label: (el.textContent ?? '').trim() || el.tagName,
            by: (top.textContent ?? '').trim().slice(0, 32) || top.tagName,
          }
        : null;
    })
    .filter((item) => item !== null);
}

/**
 * Runs in the browser: scrolls the page and its panels to the end, where
 * nothing should be left under the floating announcement.
 */
function coveredAtEnd(): LayoutSnapshot['covered'] {
  for (const el of [
    document.scrollingElement,
    ...document.querySelectorAll('*'),
  ]) {
    if (
      el &&
      el.scrollHeight > el.clientHeight &&
      /(auto|scroll)/.test(getComputedStyle(el).overflowY)
    ) {
      el.scrollTop = el.scrollHeight;
    }
  }
  window.scrollTo(0, document.documentElement.scrollHeight);
  return [
    ...document.querySelectorAll('a, button, input, textarea, select, summary'),
  ]
    .filter((el) => !el.closest('[data-announcement]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (!r.width || y < 0 || y > innerHeight || x < 0 || x > innerWidth)
        return null;
      const top = document.elementFromPoint(x, y);
      return top?.closest('[data-announcement]')
        ? {
            label:
              (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() ||
              el.tagName,
            by: 'the announcement',
          }
        : null;
    })
    .filter((item) => item !== null);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`next start did not answer on ${ORIGIN}`);
}

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: join(repoRoot(), 'www'),
  // Render the Get unstuck form (off by default) so its fields are measured.
  env: { ...process.env, GROWTH_UNSTUCK_FORM_ENABLED: 'true' },
  stdio: 'ignore',
});
const browser = await chromium.launch().catch((error: unknown) => {
  server.kill();
  throw error;
});

const issues: LayoutIssue[] = [];
try {
  await waitForServer();
  for (const viewport of LAYOUT_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.width <= PHONE_MAX_WIDTH,
      hasTouch: true,
    });
    // tsx keeps function names with an `__name` helper the page doesn't have.
    await context.addInitScript({ content: 'window.__name = (f) => f;' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(ORIGIN + path, { waitUntil: 'load' });
      await settle(page);
      const measured = await page.evaluate(measure);
      const aligned = await page.evaluate(edges, null);
      const covered = await page.evaluate(coveredAtEnd);
      issues.push(
        ...layoutIssues({
          page: path,
          viewport,
          covered,
          ...measured,
          ...aligned,
        }),
      );
    }
    for (const path of viewport.width <= PHONE_MAX_WIDTH ? MENU_PAGES : []) {
      await page.goto(ORIGIN + path, { waitUntil: 'load' });
      await settle(page);
      await page.getByRole('button', { name: 'Open menu' }).click();
      await settle(page);
      issues.push(
        ...layoutIssues({
          page: `${path} (menu open)`,
          viewport,
          covered: await page.evaluate(coveredInMenu),
          ...(await page.evaluate(measure)),
          ...(await page.evaluate(edges, '[role="dialog"]')),
        }),
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(
  `Layout: ${PAGES.length} pages at ${LAYOUT_VIEWPORTS.map((v) => `${v.width}x${v.height}`).join(', ')}`,
);
for (const issue of issues) {
  console.log(
    `  ${issue.viewport.padEnd(13)} ${issue.rule.padEnd(12)} ${issue.page}  ${issue.detail}`,
  );
}
console.log(issues.length ? `${issues.length} issues` : 'No issues');
process.exit(issues.length ? 1 : 0);
