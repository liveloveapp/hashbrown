import { type Browser, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createWorkbenchStore } from '../../examples/quickstart/runtime/workbench';
import {
  createWorkbenchCapture,
  type WorkbenchCapture,
} from '../../examples/quickstart/runtime/workbench-capture';
import type { WorkbenchLessonId } from '../../examples/quickstart/runtime/workbench-lessons';
import {
  WORKBENCH_MESSAGE_VERSION,
  type WorkbenchChildMessage,
} from '../../examples/quickstart/runtime/workbench-messages';
import { workbenchMilestones } from '../../examples/quickstart/runtime/workbench-timeline';

/** A deterministic tools-lesson capture with one tool result, built in Node. */
export function createToolsFixtureCapture(): WorkbenchCapture {
  const store = createWorkbenchStore('ui');
  store.send('Plan a product demo');
  store.record('request', { requestId: 'embed-1' });
  store.record('source', { source: 'test-fixture' });
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  store.parsed({
    ui: [
      {
        SummaryCard: {
          props: { title: 'Product demo', steps: ['Outline', 'Record'] },
        },
      },
    ],
  });
  store.settle('complete', 'stop');
  const capture = createWorkbenchCapture(store.getSnapshot(), {
    lesson: 'tools',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
  const ids = workbenchMilestones(capture.events, 'ui').map((item) => item.id);
  if (!ids.includes('tool-readcontext-1'))
    throw new Error(
      `Fixture capture lacks tool-readcontext-1: ${ids.join(', ')}`,
    );
  return capture;
}

/** A docs column's panel: 740px wide at the docs page's 4:3 frame ratio. */
const DOCS_FRAME = { width: 740, height: 555 };

/** Reserves, then releases, a localhost port no server is listening on. */
export async function unusedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, 'localhost', done));
  const address = probe.address();
  await new Promise<void>((done) => probe.close(() => done()));
  if (!address || typeof address === 'string')
    throw new Error('Missing harness port');
  return address.port;
}

/**
 * The parent docs page: frames the workbench and loads a capture on ready.
 *
 * @param src - The workbench URL to frame.
 * @param target - The workbench origin messages are posted to.
 * @param capture - The capture to load once the workbench is ready.
 * @param frame - The iframe size; a docs column's panel by default.
 */
export function harnessHtml(
  src: string,
  target: string,
  capture: WorkbenchCapture,
  frame: { readonly width: number; readonly height: number } = DOCS_FRAME,
) {
  const config = JSON.stringify({ src, target, capture }).replace(
    /</g,
    '\\u003c',
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Embed harness</title></head>
<body style="margin:0"><iframe id="wb" style="width:${frame.width}px;height:${frame.height}px;border:0;display:block"></iframe>
<script>
const config = ${config};
const frame = document.getElementById('wb');
window.__received = [];
window.__post = (message) => frame.contentWindow.postMessage(message, config.target);
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || typeof data.type !== 'string' || !data.type.startsWith('hb-workbench:')) return;
  window.__received.push({ origin: event.origin, data });
  if (data.type === 'hb-workbench:ready')
    window.__post({ type: 'hb-workbench:load', version: ${WORKBENCH_MESSAGE_VERSION}, capture: config.capture });
});
frame.src = config.src;
</script></body></html>`;
}

/** One replay embed the harness drives. */
interface EmbedCase {
  readonly lesson: WorkbenchLessonId;
  readonly capture: WorkbenchCapture;
  /** The milestone to seek to; checked against the loaded milestones. */
  readonly milestone: string;
}

/**
 * Drives `react.html?lesson=<lesson>&embed=replay` from a cross-origin parent
 * at `http://localhost:<port>`, the way a docs page would, for the tools
 * fixture and the published server-threads capture: load the capture on
 * `ready`, seek to a milestone, check the embedded chrome, and assert the
 * replay made no `/api/` requests. Server-threads covers a loopback-only
 * lesson, whose replay must never ask the server for a session.
 */
export async function verifyEmbedWorkbench(options: {
  readonly browser: Browser;
  /** The verifier server, e.g. `http://127.0.0.1:1234`. */
  readonly origin: string;
}) {
  const cases: readonly EmbedCase[] = [
    {
      lesson: 'tools',
      capture: createToolsFixtureCapture(),
      milestone: 'tool-readcontext-1',
    },
    {
      lesson: 'server-threads',
      capture: JSON.parse(
        readFileSync(
          resolve(
            'www/public/video/docs/canonical-workbench-server-threads-react-capture.json',
          ),
          'utf8',
        ),
      ) as WorkbenchCapture,
      milestone: 'complete-1',
    },
  ];
  const results = [];
  for (const item of cases) results.push(await verifyEmbedCase(options, item));
  return results;
}

async function verifyEmbedCase(
  options: { readonly browser: Browser; readonly origin: string },
  { lesson, capture, milestone }: EmbedCase,
) {
  const parent = `http://localhost:${await unusedPort()}`;
  // The routed parent has no address space, so Chrome's Local Network Access
  // checks would block its frame of the loopback server without this grant.
  const context = await options.browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['local-network-access'],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/'))
      apiRequests.push(`${request.method()} ${url.pathname}`);
  });
  try {
    await page.route(`${parent}/harness.html`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: harnessHtml(
          `${options.origin}/react.html?lesson=${lesson}&embed=replay`,
          options.origin,
          capture,
        ),
      }),
    );
    await page.goto(`${parent}/harness.html`);
    const received = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __received: { origin: string; data: WorkbenchChildMessage }[];
            }
          ).__received,
      );
    const waitFor = async (
      type: WorkbenchChildMessage['type'],
      failure: string,
      match: (data: WorkbenchChildMessage) => boolean = () => true,
    ) => {
      try {
        await expect
          .poll(
            async () =>
              (await received()).some(
                ({ data }) => data.type === type && match(data),
              ),
            { timeout: 15_000 },
          )
          .toBe(true);
      } catch {
        throw new Error(
          `${failure} Received: ${JSON.stringify((await received()).map(({ origin, data }) => ({ origin, type: data.type, ...('reason' in data ? { reason: data.reason } : {}) })))}`,
        );
      }
      return (await received())
        .map(({ data }) => data)
        .find(
          (data) => data.type === type && match(data),
        ) as WorkbenchChildMessage;
    };

    const ready = await waitFor(
      'hb-workbench:ready',
      'The embedded workbench never posted ready.',
    );
    expect(ready).toMatchObject({ mode: 'replay', lesson });
    const loaded = await waitFor(
      'hb-workbench:loaded',
      `The workbench posted ready but never loaded the capture: is ${parent} accepted as a parent origin?`,
    );
    const milestones =
      loaded.type === 'hb-workbench:loaded'
        ? loaded.milestones.map((item) => item.id)
        : [];
    expect(milestones).toContain(milestone);
    expect(
      (await received()).every(({ origin }) => origin === options.origin),
    ).toBe(true);

    await page.evaluate(
      (message) =>
        (window as unknown as { __post: (value: unknown) => void }).__post(
          message,
        ),
      {
        type: 'hb-workbench:seek',
        version: WORKBENCH_MESSAGE_VERSION,
        milestone,
      },
    );
    await waitFor(
      'hb-workbench:state',
      `The workbench never reported the seek to ${milestone}.`,
      (data) =>
        data.type === 'hb-workbench:state' && data.milestone === milestone,
    );

    const frame = page.frameLocator('#wb');
    await expect(frame.locator('.wb:visible')).toHaveCount(1);
    await expect(frame.locator('.wb-lessons')).toHaveCount(0);
    await expect(frame.locator('.wb:visible .wb-composer')).toBeHidden();
    // A replay names its recording by commit alone, or "Recorded" without one.
    await expect(
      frame.locator('.wb:visible .wb-chat .wb-panel-head [role="status"]'),
    ).toHaveText(/^(?:[0-9a-f]{7}|Recorded)$/);
    // A docs column is under the workbench's 800px phone breakpoint; the embed
    // must still fit the frame with the inspector beside the chat.
    await expect(frame.locator('.wb:visible .wb-playback')).toBeInViewport({
      ratio: 1,
    });
    const inspector = await frame
      .locator('.wb:visible .wb-inspector')
      .boundingBox();
    expect(inspector?.width ?? 0).toBeGreaterThanOrEqual(320);
    expect(errors).toEqual([]);
    // A replay shows its capture only: no session, history or chat requests.
    expect(apiRequests, `${lesson} replay made API requests`).toEqual([]);
    return {
      framework: 'react',
      lesson,
      embed: 'replay',
      parent,
      milestones,
      source: lesson === 'tools' ? 'test-fixture' : 'published-capture',
      passed: true,
    };
  } finally {
    await context.close();
  }
}
