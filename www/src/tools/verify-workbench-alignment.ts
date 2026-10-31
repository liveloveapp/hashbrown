import { type Browser, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkbenchCapture } from '../../examples/quickstart/runtime/workbench-capture';
import { harnessHtml, unusedPort } from './verify-embed-workbench';
import { checkWorkbenchTabs } from './verify-workbench-layout';

/**
 * Opens the generative UI replay inside a docs-style parent at the embed
 * frame (790×720) and at full width (1440×900), seeks to its last milestone,
 * and checks the spacing grid and alignments on every inspector tab.
 */
export async function verifyWorkbenchAlignment(options: {
  readonly browser: Browser;
  /** The verifier server, e.g. `http://127.0.0.1:1234`. */
  readonly origin: string;
}) {
  const capture = JSON.parse(
    readFileSync(
      resolve(
        'www/public/video/docs/canonical-workbench-ui-react-capture.json',
      ),
      'utf8',
    ),
  ) as WorkbenchCapture;
  const results = [];
  for (const frame of [
    { width: 790, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    const parent = `http://localhost:${await unusedPort()}`;
    const context = await options.browser.newContext({
      viewport: frame,
      permissions: ['local-network-access'],
    });
    const page = await context.newPage();
    try {
      await page.route(`${parent}/harness.html`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: harnessHtml(
            `${options.origin}/react.html?lesson=generative-ui&embed=replay`,
            options.origin,
            capture,
            frame,
          ),
        }),
      );
      await page.goto(`${parent}/harness.html`);
      const received = () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __received: {
                  data: {
                    type: string;
                    milestones?: { id: string }[];
                    milestone?: string;
                  };
                }[];
              }
            ).__received,
        );
      await expect
        .poll(
          async () =>
            (await received()).some(
              ({ data }) => data.type === 'hb-workbench:loaded',
            ),
          { timeout: 15_000 },
        )
        .toBe(true);
      const loaded = (await received()).find(
        ({ data }) => data.type === 'hb-workbench:loaded',
      );
      const last = loaded?.data.milestones?.at(-1)?.id;
      if (!last) throw new Error('The generative UI capture has no milestones');
      await page.evaluate(
        (milestone) =>
          (window as unknown as { __post: (value: unknown) => void }).__post({
            type: 'hb-workbench:seek',
            version: 1,
            milestone,
          }),
        last,
      );
      await expect
        .poll(async () =>
          (await received()).some(
            ({ data }) =>
              data.type === 'hb-workbench:state' && data.milestone === last,
          ),
        )
        .toBe(true);
      const workbench = page.frame({ url: /react\.html/ });
      if (!workbench) throw new Error('Missing the workbench frame');
      const reports = await checkWorkbenchTabs(workbench);
      results.push({
        framework: 'react',
        lesson: 'generative-ui',
        check: 'spacing-grid',
        frame: `${frame.width}x${frame.height}`,
        tabs: reports,
        passed: true,
      });
    } finally {
      await context.close();
    }
  }
  return results;
}
