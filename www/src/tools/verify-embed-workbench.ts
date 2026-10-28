import { type Browser, expect } from '@playwright/test';
import { createServer } from 'node:net';
import { createWorkbenchStore } from '../../examples/quickstart/runtime/workbench';
import {
  createWorkbenchCapture,
  type WorkbenchCapture,
} from '../../examples/quickstart/runtime/workbench-capture';
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
  if (!ids.includes('tool-result-1'))
    throw new Error(`Fixture capture lacks tool-result-1: ${ids.join(', ')}`);
  return capture;
}

/** Reserves, then releases, a localhost port no server is listening on. */
async function unusedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, 'localhost', done));
  const address = probe.address();
  await new Promise<void>((done) => probe.close(() => done()));
  if (!address || typeof address === 'string')
    throw new Error('Missing harness port');
  return address.port;
}

/** The parent docs page: frames the workbench and loads a capture on ready. */
function harnessHtml(src: string, target: string, capture: WorkbenchCapture) {
  const config = JSON.stringify({ src, target, capture }).replace(
    /</g,
    '\\u003c',
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Embed harness</title></head>
<body style="margin:0"><iframe id="wb" style="width:1200px;height:800px;border:0"></iframe>
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

/**
 * Drives `react.html?lesson=tools&embed=replay` from a cross-origin parent at
 * `http://localhost:<port>`, the way a docs page would: load a capture on
 * `ready`, seek to `tool-result-1`, and check the embedded chrome.
 */
export async function verifyEmbedWorkbench(options: {
  readonly browser: Browser;
  /** The verifier server, e.g. `http://127.0.0.1:1234`. */
  readonly origin: string;
}) {
  const capture = createToolsFixtureCapture();
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
  try {
    await page.route(`${parent}/harness.html`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: harnessHtml(
          `${options.origin}/react.html?lesson=tools&embed=replay`,
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
    expect(ready).toMatchObject({ mode: 'replay', lesson: 'tools' });
    const loaded = await waitFor(
      'hb-workbench:loaded',
      `The workbench posted ready but never loaded the capture: is ${parent} accepted as a parent origin?`,
    );
    const milestones =
      loaded.type === 'hb-workbench:loaded'
        ? loaded.milestones.map((item) => item.id)
        : [];
    expect(milestones).toContain('tool-result-1');
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
        milestone: 'tool-result-1',
      },
    );
    await waitFor(
      'hb-workbench:state',
      'The workbench never reported the seek to tool-result-1.',
      (data) =>
        data.type === 'hb-workbench:state' &&
        data.milestone === 'tool-result-1',
    );

    const frame = page.frameLocator('#wb');
    await expect(frame.locator('.wb:visible')).toHaveCount(1);
    await expect(frame.locator('.wb-lessons')).toHaveCount(0);
    await expect(frame.locator('.wb:visible .wb-composer')).toBeHidden();
    await expect(
      frame.locator('.wb:visible .wb-chat .wb-panel-head'),
    ).toContainText('Recorded');
    expect(errors).toEqual([]);
    return {
      framework: 'react',
      lesson: 'tools',
      embed: 'replay',
      parent,
      milestones,
      source: 'test-fixture',
      passed: true,
    };
  } finally {
    await context.close();
  }
}
