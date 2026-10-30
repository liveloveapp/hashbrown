/** Real-font SVG, native dialog and mobile scrolling audit, run by www:e2e. */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium, expect, type Locator } from '@playwright/test';
import { DOCS_DIAGRAMS } from '../components/diagrams/diagram-catalog';
import { listDocs, readDoc, SDKS } from '../lib/content';
import {
  type DiagramGeometry,
  diagramNavigationIssue,
  diagramRequestIssue,
  geometryIssues,
  inventoryIssues,
} from '../lib/diagram-checks';
import { diagramTargetsIn } from '../lib/element-inventory';
import { repoRoot } from '../lib/repo-root';
import {
  diagnosticOrigin,
  requireDeploymentOrigin,
} from '../lib/docs-deployment';

const root = repoRoot();
const output = resolve(
  root,
  process.env.DOCS_DIAGRAM_OUTPUT ?? 'dist/docs-diagrams/ci',
);
const targets = diagramTargetsIn(
  SDKS.flatMap((sdk) =>
    listDocs(sdk).map((slug) => ({
      sdk,
      slug,
      body: readDoc(sdk, slug)?.body ?? '',
    })),
  ),
);
const catalog = Object.keys(DOCS_DIAGRAMS);
const used = new Set(targets.flatMap((target) => target.ids));
if (!targets.length || catalog.some((id) => !used.has(id)))
  throw new Error('Empty or incomplete diagram audit inventory');
await mkdir(output, { recursive: true });
let server: ChildProcess | undefined;
let logs = '';
let startupError: Error | undefined;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function start(): Promise<string> {
  if (process.env.DOCS_DIAGRAM_ORIGIN) {
    return requireDeploymentOrigin(process.env.DOCS_DIAGRAM_ORIGIN);
  }
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string')
    throw new Error('No diagram report port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  server = spawn(
    process.execPath,
    [
      join(root, 'node_modules/next/dist/bin/next'),
      'start',
      '-H',
      '127.0.0.1',
      '-p',
      String(port),
    ],
    { cwd: join(root, 'www'), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.on('error', (error) => {
    startupError = error;
  });
  for (const stream of [server.stdout, server.stderr])
    stream?.on('data', (chunk) => {
      logs = (logs + String(chunk)).slice(-20000);
    });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError || server.exitCode !== null)
      throw new Error(
        `Diagram server exited: ${startupError?.message ?? logs}`,
      );
    // Only probe after this owned process announces its successful bind.
    if (logs.includes('Ready in')) {
      if ((await fetch(origin)).ok) return origin;
    }
    await delay(250);
  }
  throw new Error(`Diagram server did not become ready: ${logs}`);
}

async function measure(region: Locator): Promise<DiagramGeometry> {
  return region.evaluate((element) => {
    const svg = element.querySelector('svg');
    if (!svg) throw new Error('Diagram SVG missing');
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const normalizeFont = (family: string) =>
      family.replace(/["']/g, '').trim();
    const fonts = [...svg.querySelectorAll('text')].map((text) => {
      const style = getComputedStyle(text);
      const firstFamily = style.fontFamily.split(',')[0];
      const family = normalizeFont(firstFamily);
      const registered = [...document.fonts].some(
        (face) =>
          normalizeFont(face.family) === family && face.status === 'loaded',
      );
      return {
        family,
        loaded:
          registered &&
          document.fonts.check(
            `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${firstFamily}`,
            text.textContent ?? '',
          ),
      };
    });
    return {
      fonts,
      canvas: box(svg),
      naturalWidth: svg.viewBox.baseVal.width,
      nodes: [...svg.querySelectorAll('[data-diagram-node]')].map((node) => {
        const rect = node.querySelector('rect');
        if (!rect) throw new Error('Diagram node rectangle missing');
        return {
          id: node.getAttribute('data-diagram-node') ?? '',
          box: box(rect),
        };
      }),
      texts: [...svg.querySelectorAll('text')].flatMap((text) =>
        [
          ...(text.children.length ? text.querySelectorAll('tspan') : [text]),
        ].map((line) => ({
          text: line.textContent ?? '',
          node:
            line
              .closest('[data-diagram-node]')
              ?.getAttribute('data-diagram-node') ?? undefined,
          box: box(line),
        })),
      ),
      viewportWidth:
        element.clientWidth -
        parseFloat(getComputedStyle(element).paddingLeft) -
        parseFloat(getComputedStyle(element).paddingRight),
      documentWidth: document.documentElement.scrollWidth,
      windowWidth: innerWidth,
    };
  });
}

const results: {
  page: string;
  viewport: number;
  diagram?: string;
  issues: string[];
}[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let auditedOrigin = diagnosticOrigin(process.env.DOCS_DIAGRAM_ORIGIN);
let fatalError: string | undefined;
try {
  const origin = await start();
  auditedOrigin = origin;
  browser = await chromium.launch();
  for (const width of [1440, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      serviceWorkers: 'block',
    });
    await context.addInitScript({ content: 'window.__name = (f) => f;' });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    // The audit operates only static diagrams. Never send a model/workbench request.
    await context.route('**/*', (route) => {
      const issue = diagramRequestIssue(
        route.request().method(),
        route.request().url(),
      );
      if (issue) {
        pageErrors.push(issue);
        return route.abort();
      }
      return route.continue();
    });
    for (const [targetIndex, target] of targets.entries()) {
      pageErrors.length = 0;
      const response = await page.goto(origin + target.path, {
        waitUntil: 'load',
      });
      const navigationIssue = diagramNavigationIssue(origin, page.url());
      if (navigationIssue)
        throw new Error(`${target.path}: ${navigationIssue}`);
      await page.evaluate(() => document.fonts.ready);
      const figures = page.locator('figure[data-diagram]');
      const actual = await figures.evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('data-diagram') ?? ''),
      );
      const placementIssues = inventoryIssues(target.ids, actual, catalog);
      if (!response?.ok()) placementIssues.push(`HTTP ${response?.status()}`);
      if (placementIssues.length) {
        results.push({
          page: target.path,
          viewport: width,
          issues: [...placementIssues, ...pageErrors],
        });
        await page.screenshot({
          path: join(
            output,
            `${width}-${target.path.replaceAll('/', '_')}-inventory.png`,
          ),
        });
        continue;
      }
      for (const [index, id] of target.ids.entries()) {
        const issues: string[] = [];
        const figure = figures.nth(index);
        try {
          const region = figure.getByRole('region').first();
          const measured = await measure(region);
          issues.push(...geometryIssues(measured, width > 600));
          const maxScroll = await region.evaluate(
            (el) => el.scrollWidth - el.clientWidth,
          );
          if (width <= 600 && maxScroll > 1) {
            await region.focus();
            await page.keyboard.press('ArrowRight');
            await expect
              .poll(() => region.evaluate((el) => el.scrollLeft))
              .toBeGreaterThan(0);
            await region.evaluate((el) => {
              el.scrollLeft = el.scrollWidth;
            });
            await expect
              .poll(() => region.evaluate((el) => el.scrollLeft))
              .toBeGreaterThanOrEqual(maxScroll - 1);
            await region.evaluate((el) => {
              el.scrollLeft = 0;
            });
          }
          const trigger = figure.getByRole('button', {
            name: 'Expand diagram',
          });
          const dialog = figure.locator('dialog');
          // Retry keyboard activation if the server-rendered control precedes hydration.
          await expect(async () => {
            if (
              !(await dialog.evaluate((el) => (el as HTMLDialogElement).open))
            ) {
              await trigger.focus();
              await page.keyboard.press('Enter');
            }
            await expect(dialog).toBeVisible();
          }).toPass({ timeout: 10000 });
          const close = dialog.getByRole('button', { name: 'Close' });
          await expect(close).toBeFocused();
          const expanded = await measure(dialog.getByRole('region'));
          issues.push(...geometryIssues(expanded, false));
          const description = figure.locator(':scope > details p');
          const descriptionText = await description.textContent();
          if (!descriptionText?.trim())
            throw new Error('Inline diagram description missing');
          await expect(dialog.locator('details p')).toHaveText(descriptionText);
          const summary = dialog.locator('summary');
          await summary.click();
          await expect(dialog.locator('details p')).toBeVisible();
          await summary.focus();
          await page.keyboard.press('Tab');
          await expect(close).toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(summary).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(dialog).not.toBeVisible();
          // Native close is asynchronous. Wait for onClose to remove its SVG
          // before testing another focus target, so queued focus restoration cannot race it.
          await expect(dialog.locator('[role="region"]')).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await trigger.click();
          await expect(dialog).toBeVisible();
          const bounds = await close.boundingBox();
          if (
            !bounds ||
            bounds.x < 0 ||
            bounds.x + bounds.width > width ||
            bounds.y < 0 ||
            bounds.y + bounds.height > 1000
          )
            issues.push('Expanded close control outside viewport');
          const ids = await page
            .locator('[id]')
            .evaluateAll((els) => els.map((el) => el.id));
          if (ids.length !== new Set(ids).size)
            issues.push('Duplicate DOM IDs while expanded');
          await close.click();
          await expect(dialog).not.toBeVisible();
          await expect(dialog.locator('[role="region"]')).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } catch (error) {
          issues.push(error instanceof Error ? error.message : String(error));
          await page.keyboard.press('Escape').catch(() => undefined);
        }
        if (issues.length)
          await figure
            .screenshot({
              path: join(
                output,
                `${width}-${target.path.replaceAll('/', '_')}-${index}.png`,
              ),
            })
            .catch(() => undefined);
        results.push({
          page: target.path,
          viewport: width,
          diagram: id,
          issues,
        });
        if (results.filter((result) => result.issues.length).length >= 5)
          throw new Error(
            'Diagram audit stopped after five failures; see report.json and screenshots',
          );
      }
      results.push({
        page: target.path,
        viewport: width,
        issues: [...placementIssues, ...pageErrors],
      });
      if ((targetIndex + 1) % 10 === 0)
        console.log(
          `Diagram audit ${width}px: ${targetIndex + 1}/${targets.length} pages`,
        );
    }
    await context.close();
  }
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error);
  console.error(`Diagram audit failed: ${fatalError}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const owned = server;
    const exited = new Promise<void>((resolve) =>
      owned.once('exit', () => resolve()),
    );
    owned.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await writeFile(join(output, 'server.log'), logs);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(
      {
        origin: auditedOrigin,
        expectedRevision: process.env.DOCS_DIAGRAM_EXPECTED_REVISION,
        passed:
          !fatalError &&
          results.length > 0 &&
          results.every((result) => !result.issues.length),
        fatalError,
        targets,
        definitions: catalog.length,
        results,
      },
      null,
      2,
    ),
  );
}
const failures = results.filter((result) => result.issues.length);
console.log(
  `Diagrams: ${targets.length} pages, ${used.size} definitions, ${targets.reduce((n, t) => n + t.ids.length, 0)} placements at desktop and 320px.`,
);
for (const failure of failures) console.error(JSON.stringify(failure));
if (failures.length) process.exitCode = 1;
