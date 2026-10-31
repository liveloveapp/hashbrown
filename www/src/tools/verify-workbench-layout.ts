import { expect, type Frame, type Page } from '@playwright/test';

/**
 * Asserts the shell opens at its recording defaults: expanded sidebar, every
 * section open, a 44/56 split, and one inspector panel (or, on the Requests tab, the
 * overview slider above the table).
 */
export async function expectWorkbenchDefaultLayout(page: Page): Promise<void> {
  const root = page.locator('.wb:visible');
  await expect(root).not.toHaveClass(/\bwb-rail\b/);
  await expect(root.locator('.wb-split')).toHaveAttribute(
    'aria-valuenow',
    '44',
  );
  await expect(
    root.locator('.wb-nav-heading[aria-expanded=false]'),
  ).toHaveCount(0);
  const requests = root.locator('.wb-inspector .wb-requests');
  if ((await requests.count()) > 0) {
    // The Requests tab shows an overview and a table; there is no inspector panel.
    await expect(
      requests.getByRole('slider', { name: 'Seek request timeline' }),
    ).toBeVisible();
    // Before the first request the table has no rows, so it has no size.
    await expect(requests.locator('table.wb-requests-table')).toBeAttached();
    return;
  }
  // One panel per tab: a single section with a mode toggle, no side-by-side pair.
  await expect(root.locator('.wb-inspector [data-captured]')).toHaveCount(1);
  await expect(root.locator('.wb-inspector [data-detail]')).toHaveCount(0);
  await expect(
    root.getByRole('radiogroup', { name: 'Inspector view', exact: true }),
  ).toBeVisible();
}

/**
 * Asserts the page has no horizontal overflow. Narrow layouts clip the shell
 * sideways, so document width alone would hide content that is cut off: every
 * rendered element must also lie inside the viewport unless an ancestor lets
 * the user scroll it horizontally.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const scrollsSideways = (element: Element) => {
      for (
        let node = element.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('.wb:not([hidden]) *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (getComputedStyle(element).visibility === 'hidden') return false;
        return (
          (rect.left < -1 || rect.right > innerWidth + 1) &&
          !scrollsSideways(element)
        );
      })
      .slice(0, 5)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} ${Math.round(element.getBoundingClientRect().right)}px`,
      );
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? Infinity);
  expect(offenders).toEqual([]);
}

/** The inspector tabs every alignment pass visits, in tab order. */
export const WORKBENCH_ALIGNMENT_TABS = [
  'UI',
  'JSON',
  'Requests',
  'State',
] as const;

/** One inspector tab's alignment pass: the numbers it measured and what failed. */
export interface WorkbenchAlignmentReport {
  readonly tab: string;
  readonly measurements: Record<string, number | readonly number[]>;
  readonly failures: readonly string[];
}

/**
 * Measures the workbench's spacing grid and alignments in one document with
 * `getBoundingClientRect` and computed styles, with a 0.5px tolerance:
 *
 * - the chat head and the inspector tab row are the same height and level;
 * - each panel's head, body and caption share the panel's inner left edge;
 * - the section title and mode toggle share a centre line;
 * - the playback buttons share a centre line, and the timeline is inset
 *   equally on both sides (and, in one row, centred on the buttons);
 * - turn labels start at their tick's line;
 * - Requests: picker, detail tabs and facts share a left edge, fact columns
 *   and rows line up, table rows share one grid height;
 * - State: tree rows share one grid height and indent 16px a level;
 * - the Requests playhead knob is centred on its line;
 * - the panel gap equals the frame padding;
 * - every padding (with its border) and gap under the chat, inspector and
 *   playback, every control and row height, and every line height is a
 *   multiple of 4, except 1px and 2px lines.
 *
 * @param target - The page or frame that renders the workbench.
 * @param tab - The inspector tab currently selected, for the report.
 */
export async function measureWorkbenchAlignment(
  target: Page | Frame,
  tab: string,
): Promise<WorkbenchAlignmentReport> {
  const result = await target.evaluate(() => {
    const failures: string[] = [];
    const measurements: Record<string, number | number[]> = {};
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
    const onGrid = (value: number) =>
      Math.abs(value - Math.round(value / 4) * 4) <= 0.5;
    const round = (value: number) => Math.round(value * 100) / 100;
    const visible = (
      element: Element | null | undefined,
    ): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        getComputedStyle(element).visibility !== 'hidden'
      );
    };
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}${[...element.classList].map((name) => `.${name}`).join('')}`;
    const px = (element: Element, property: string, pseudo?: string) =>
      parseFloat(
        getComputedStyle(element, pseudo).getPropertyValue(property),
      ) || 0;
    const rect = (element: Element) => element.getBoundingClientRect();
    const expectNear = (name: string, values: number[]) => {
      measurements[name] = values.map(round);
      if (values.some((value) => !near(value, values[0])))
        failures.push(`${name}: ${values.map(round).join(' vs ')}`);
    };
    const root = [...document.querySelectorAll('.wb')].find(visible);
    if (!root) return { failures: ['no visible .wb'], measurements };
    const chat = root.querySelector('.wb-chat');
    const inspector = root.querySelector('.wb-inspector');
    const playback = root.querySelector('.wb-playback');
    if (!visible(chat) || !visible(inspector) || !visible(playback))
      return {
        failures: ['missing chat, inspector or playback'],
        measurements,
      };
    const innerLeft = (panel: Element) =>
      rect(panel).left + px(panel, 'border-left-width');
    const contentLeft = (element: Element) =>
      rect(element).left +
      px(element, 'border-left-width') +
      px(element, 'padding-left');

    // 1. Chat head and inspector tab row: same height, level bottoms.
    const head = chat.querySelector('.wb-panel-head');
    const tabs = inspector.querySelector('.wb-tabs');
    if (visible(head) && visible(tabs)) {
      expectNear('head heights (chat, tabs)', [
        rect(head).height,
        rect(tabs).height,
      ]);
      expectNear('head bottoms (chat, tabs)', [
        rect(head).bottom,
        rect(tabs).bottom,
      ]);
    } else failures.push('missing chat head or inspector tabs');

    // 2. One inner left edge per panel.
    const chatEdge = innerLeft(chat) + 16;
    const chatEdges = [chatEdge];
    if (visible(head)) chatEdges.push(contentLeft(head));
    // The live and replay feeds share the slot; one is visible.
    const feed = [...chat.querySelectorAll('.wb-feed')].find(visible);
    if (feed) chatEdges.push(contentLeft(feed));
    const composer = chat.querySelector('.wb-composer');
    if (visible(composer)) chatEdges.push(contentLeft(composer));
    expectNear('chat left edges (panel+16, head, feed, composer)', chatEdges);
    const inspectorEdge = innerLeft(inspector) + 16;
    const inspectorEdges = [inspectorEdge];
    const firstTab = tabs?.querySelector('[role="tab"]');
    if (visible(firstTab)) inspectorEdges.push(contentLeft(firstTab));
    const sectionHead = inspector.querySelector('.wb-section-head');
    if (visible(sectionHead)) inspectorEdges.push(contentLeft(sectionHead));
    const inspection = inspector.querySelector(
      '.wb-inspection:not(.wb-requests)',
    );
    if (visible(inspection)) inspectorEdges.push(contentLeft(inspection));
    const caption = inspector.querySelector('.wb-caption');
    if (visible(caption)) inspectorEdges.push(contentLeft(caption));
    expectNear(
      'inspector left edges (panel+16, tab text, section head, body, caption)',
      inspectorEdges,
    );

    // The inspector body (code block or tree) fills the inspection box down
    // to its bottom padding, with no empty band above the caption.
    if (visible(inspection)) {
      const body = [...inspection.children].filter(visible).at(-1);
      if (body) {
        const box = rect(inspection);
        expectNear('inspector body bottom vs inspection bottom - padding', [
          rect(body).bottom + inspection.scrollTop,
          box.top +
            px(inspection, 'border-top-width') +
            inspection.scrollHeight -
            px(inspection, 'padding-bottom'),
        ]);
      }
    }

    // 3. Section title and mode toggle share a centre line; caption on the grid.
    const title = sectionHead?.querySelector('h3');
    const toggle = sectionHead?.querySelector('.wb-segmented');
    if (visible(title) && visible(toggle))
      expectNear('section head centres (title, toggle)', [
        rect(title).top + rect(title).height / 2,
        rect(toggle).top + rect(toggle).height / 2,
      ]);
    if (visible(caption)) {
      measurements['caption height'] = round(rect(caption).height);
      if (!onGrid(rect(caption).height))
        failures.push(`caption height ${round(rect(caption).height)}`);
    }

    // 4. Playback: one button centre line; the timeline inset equally.
    const player = playback.querySelector('.wb-player');
    const scrubber = playback.querySelector('.wb-scrubber');
    const transport = playback.querySelector('.wb-transport');
    const rowButtons = [
      ...playback.querySelectorAll(
        '.wb-transport button, .wb-player > button, .wb-player > .wb-time',
      ),
    ].filter(visible);
    const centres = rowButtons.map(
      (button) => rect(button).top + rect(button).height / 2,
    );
    if (centres.length) expectNear('playback control centres', centres);
    if (visible(player) && visible(scrubber) && visible(transport)) {
      const track = rect(scrubber);
      const wrapped = track.top >= rect(transport).bottom - 0.5;
      if (wrapped)
        expectNear('timeline insets (left, right of the bar)', [
          track.left - rect(player).left,
          rect(player).right - track.right,
        ]);
      else {
        const after = scrubber.nextElementSibling;
        if (visible(after))
          expectNear('timeline gaps (after transport, before time)', [
            track.left - rect(transport).right,
            rect(after).left - track.right,
          ]);
        const segment = scrubber.querySelector('.wb-segment');
        if (visible(segment) && centres.length)
          expectNear('track centre vs control centre', [
            rect(segment).top + rect(segment).height / 2,
            centres[0],
          ]);
      }

      // 5. Turn labels start at their tick's line.
      const ticks = [...scrubber.querySelectorAll('.wb-events button')]
        .filter((tick) => rect(tick).width > 0)
        .map((tick) => {
          const box = rect(tick);
          return box.left + px(tick, 'left', '::before');
        });
      const labels = [
        ...scrubber.querySelectorAll('.wb-segment > span'),
      ].filter(visible);
      const offsets = labels.map((label) => {
        const left = rect(label).left;
        const nearest = ticks.reduce(
          (best, tick) =>
            Math.abs(tick - left) < Math.abs(best - left) ? tick : best,
          Infinity,
        );
        return left - nearest;
      });
      measurements['turn label offsets from tick line'] = offsets.map(round);
      offsets.forEach((offset, index) => {
        if (!near(offset, 0))
          failures.push(
            `turn label ${index + 1} is ${round(offset)}px off its tick`,
          );
      });
    }

    // 6. Requests: shared left edge, aligned fact columns, grid table rows.
    const requests = inspector.querySelector('.wb-requests');
    if (visible(requests)) {
      const detail = requests.querySelector('.wb-requests-detail');
      const edges: number[] = [];
      const picker = requests.querySelector('.wb-requests-picker');
      if (visible(picker)) edges.push(rect(picker).left);
      const detailTabs = requests.querySelector('.wb-requests-tabs');
      if (visible(detailTabs)) edges.push(rect(detailTabs).left);
      // Every detail tab fits the row: the last one ends inside its visible box.
      if (visible(detailTabs)) {
        const lastTab = [...detailTabs.children].filter(visible).at(-1);
        const inner =
          rect(detailTabs).right -
          px(detailTabs, 'border-right-width') -
          px(detailTabs, 'padding-right');
        if (lastTab) {
          measurements['last detail tab right vs row inner right'] = [
            round(rect(lastTab).right),
            round(inner),
          ];
          if (rect(lastTab).right > inner + 0.5)
            failures.push(
              `detail tabs clipped: last tab ends at ${round(rect(lastTab).right)}, row at ${round(inner)}`,
            );
        }
      }
      const facts = requests.querySelector('.wb-requests-facts');
      if (visible(facts)) edges.push(rect(facts).left);
      if (visible(detail)) edges.unshift(innerLeft(detail) + 16);
      if (edges.length > 1)
        expectNear(
          'requests left edges (detail+16, picker, tabs, facts)',
          edges,
        );
      if (visible(facts)) {
        const terms = [...facts.querySelectorAll('dt')].filter(visible);
        const values = [...facts.querySelectorAll('dd')].filter(visible);
        if (terms.length > 1)
          expectNear(
            'fact label column',
            terms.map((dt) => rect(dt).left),
          );
        if (values.length > 1)
          expectNear(
            'fact value column',
            values.map((dd) => rect(dd).left),
          );
        terms.forEach((dt, index) => {
          const dd = values[index];
          if (dd && !near(rect(dt).top, rect(dd).top))
            failures.push(`fact row ${index + 1}: label and value tops differ`);
        });
      }
      const rows = [
        ...requests.querySelectorAll('.wb-requests-table tr[data-exchange]'),
      ].filter(visible);
      if (rows.length) {
        const heights = rows.map((row) => rect(row).height);
        expectNear('request row heights', heights);
        if (!onGrid(heights[0]))
          failures.push(`request row height ${round(heights[0])}`);
      }
      // 8. The playhead knob is centred on its 2px line.
      const playhead = requests.querySelector('.wb-requests-playhead');
      if (visible(playhead)) {
        const knobCentre =
          px(playhead, 'left', '::before') +
          px(playhead, 'width', '::before') / 2;
        expectNear('playhead knob centre vs line centre', [
          knobCentre,
          rect(playhead).width / 2,
        ]);
      }
    }

    // 7. State tree: grid row heights, 16px indentation steps.
    const tree = inspector.querySelector('.wb-tree');
    if (visible(tree)) {
      const items = [
        ...tree.querySelectorAll<HTMLElement>('[role="treeitem"]'),
      ].filter(visible);
      const heights = items.map((item) => rect(item).height);
      if (heights.length) {
        expectNear('tree row heights', heights);
        if (!onGrid(heights[0]))
          failures.push(`tree row height ${round(heights[0])}`);
      }
      const base = items.find(
        (item) =>
          (Number(item.style.getPropertyValue('--wb-tree-depth')) || 0) === 0,
      );
      const steps = items.map((item) => {
        const depth =
          Number(item.style.getPropertyValue('--wb-tree-depth')) || 0;
        return (
          px(item, 'padding-left') -
          (base ? px(base, 'padding-left') : 0) -
          depth * 16
        );
      });
      measurements['tree indent error'] = [...new Set(steps.map(round))];
      if (steps.some((step) => !near(step, 0)))
        failures.push('tree indentation is not 16px a level');
    }

    // 9. The panel gap equals the frame padding.
    const framePadding = px(root, 'padding-left');
    expectNear('panel gap vs frame padding', [
      rect(inspector).left - rect(chat).right,
      framePadding,
      rect(playback).top - Math.max(rect(chat).bottom, rect(inspector).bottom),
    ]);

    // The grid sweep: paddings (with borders), gaps, heights, line heights.
    const sweep = [chat, inspector, playback].flatMap((area) => [
      area,
      ...area.querySelectorAll('*'),
    ]);
    const lines = new Set([0, 1, 2]);
    const offGrid = new Set<string>();
    for (const element of sweep) {
      if (!visible(element) || element.closest('svg')) continue;
      // Chat content belongs to the lesson's app, not the workbench chrome.
      if (element.closest('.wb-feed') && !element.matches('.wb-feed')) continue;
      const style = getComputedStyle(element);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const total =
          px(element, `padding-${side}`) + px(element, `border-${side}-width`);
        if (!lines.has(total) && !onGrid(total))
          offGrid.add(`${describe(element)} padding-${side} ${round(total)}`);
      }
      for (const property of ['row-gap', 'column-gap']) {
        const value = style.getPropertyValue(property);
        if (value === 'normal') continue;
        const gap = parseFloat(value);
        if (!lines.has(gap) && !onGrid(gap))
          offGrid.add(`${describe(element)} ${property} ${round(gap)}`);
      }
      if (
        element.childNodes.length &&
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )
      ) {
        const lineHeight = parseFloat(style.lineHeight);
        if (!onGrid(lineHeight))
          offGrid.add(`${describe(element)} line-height ${style.lineHeight}`);
      }
      // Code blocks and the tree stretch to fill the panel, so only their
      // paddings and rows are on the grid, not their viewport-driven height.
      if (
        element.matches(
          'button, select, input:not([type="range"]), [role="tab"], [role="treeitem"], tr, .wb-panel-head, .wb-tabs, .wb-section-head, .wb-caption, .wb-segmented, .wb-requests-tabs, .wb-requests-detail-head, .wb-requests-pickbar, .wb-requests-overview, .wb-playback, .wb-scrubber',
        ) &&
        !onGrid(rect(element).height)
      )
        offGrid.add(
          `${describe(element)} height ${round(rect(element).height)}`,
        );
    }
    if (offGrid.size)
      failures.push(
        `off the 4px grid: ${[...offGrid].slice(0, 30).join('; ')}`,
      );
    measurements['off-grid count'] = offGrid.size;
    return { failures, measurements };
  });
  return { tab, ...result };
}

/**
 * Selects each inspector tab in turn and asserts its alignment pass is clean.
 *
 * @param target - The page or frame that renders the workbench.
 * @returns Each tab's measurements.
 */
export async function checkWorkbenchTabs(
  target: Page | Frame,
): Promise<WorkbenchAlignmentReport[]> {
  const reports: WorkbenchAlignmentReport[] = [];
  for (const tab of WORKBENCH_ALIGNMENT_TABS) {
    const button = target
      .locator('.wb:visible')
      .getByRole('tablist', { name: 'Inspector views', exact: true })
      .getByRole('tab', { name: tab, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
    if (tab === 'Requests')
      await expect(
        target.locator('.wb:visible .wb-requests-facts'),
      ).toBeVisible();
    if (tab === 'State')
      await expect(
        target.locator('.wb:visible .wb-tree [role="treeitem"]').first(),
      ).toBeVisible();
    const report = await measureWorkbenchAlignment(target, tab);
    expect(report.failures, `${tab} tab alignment`).toEqual([]);
    reports.push(report);
  }
  return reports;
}
