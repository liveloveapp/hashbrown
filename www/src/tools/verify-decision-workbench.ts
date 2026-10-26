import { type Browser, expect } from '@playwright/test';
import type { Decision } from '@hashbrownai/core';
import { resolve } from 'node:path';

/** Verifies real decision SDKs against the selected server boundary, retaining measured recording phases. */
export async function verifyDecisionWorkbench(options: {
  browser: Browser;
  framework: string;
  origin: string;
  work: string;
  live: boolean;
  recording: boolean;
  requests: readonly Decision.Request[];
  outcome: (value: 'success' | 'low' | 'error' | 'delay') => void;
}) {
  const { browser, framework, origin, work, live, recording, requests } =
    options;
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    ...(recording
      ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
      : {}),
  });
  const started = Date.now();
  const phases: Record<string, number> = {};
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const start = requests.length;
  await page.goto(`${origin}/${framework}.html?lesson=decisions`);
  const send = page.locator('.wb:visible [data-send]');
  await expect(send).toBeEnabled();
  await expect(
    page.getByRole('article', { name: 'Application plan', exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(start);
  if (recording) await page.waitForTimeout(800);
  mark('firstRequest');
  await send.click();
  const cards = page.getByRole('article', {
    name: 'Decision result',
    exact: true,
  });
  await expect(cards).toHaveCount(1, { timeout: 60000 });
  await expect(
    cards.first().getByRole('heading', { name: 'record', exact: true }),
  ).toBeVisible();
  const apply = cards.first().getByRole('button');
  await expect(apply).toBeEnabled({ timeout: 60000 });
  await expect(cards.first()).toContainText('Confidence:');
  await expect(page.locator('.wb:visible [data-source]')).toHaveText(
    live ? 'Live model' : 'Test fixture',
  );
  mark('firstComplete');
  await page.getByRole('tab', { name: 'State', exact: true }).click();
  const inspection = page.locator('.wb:visible .wb-inspector .wb-inspection');
  await expect(inspection).toContainText('"revision": 0');
  await expect(inspection).toContainText('"nextAction": null');
  if (recording) await page.waitForTimeout(800);
  mark('accept');
  await apply.click();
  await expect(inspection).toContainText('"revision": 1');
  await expect(inspection).toContainText('"nextAction": "record"');
  await expect(apply).toBeDisabled();
  await expect(apply).toHaveText('Suggestion used');
  if (recording) await page.waitForTimeout(800);
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Follow-up', exact: true }).click();
  mark('followup');
  await send.click();
  await expect(cards).toHaveCount(2, { timeout: 60000 });
  await expect(
    cards.last().getByRole('heading', { name: 'review', exact: true }),
  ).toBeVisible();
  await expect(
    cards.last().getByRole('button', { name: 'Use suggestion', exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(apply).toBeDisabled();
  if (recording) await page.waitForTimeout(800);
  mark('secondComplete');
  const captured = requests.slice(start);
  expect(captured).toHaveLength(2);
  const last = captured[1].state as {
    input: { application: { revision: number; nextAction: string } };
  };
  expect(last.input.application.revision).toBe(1);
  expect(last.input.application.nextAction).toBe('record');
  const count = requests.length;
  mark('replay');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(send).toBeDisabled();
  if (recording) await page.waitForTimeout(1700);
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  if (await pause.count()) await pause.click();
  await page
    .getByRole('button', { name: /^Decision[.]/ })
    .first()
    .click();
  await expect(
    page.locator('[data-replay] [aria-label="Captured decision"]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-replay] button')).toHaveCount(0);
  if (recording) await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'State', exact: true }).click();
  await page
    .getByRole('button', { name: /^Suggestion applied[.]/ })
    .first()
    .click();
  await expect(inspection).toContainText('"revision": 1');
  if (recording) await page.waitForTimeout(600);
  await page.getByRole('slider', { name: 'Seek captured event' }).fill('0');
  await expect(inspection).toContainText('"revision": 0');
  await expect(inspection).toContainText('"nextAction": null');
  await page
    .getByRole('button', { name: 'Return to live', exact: true })
    .click();
  await expect(inspection).toContainText('"revision": 1');
  expect(requests).toHaveLength(count);
  mark('returnedLive');
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.screenshot({
    path: resolve(
      work,
      `${framework}-decisions-${live ? 'live' : 'fixture'}.png`,
    ),
    fullPage: true,
    animations: 'disabled',
  });
  if (recording) await page.waitForTimeout(800);
  const newConversation = async () => {
    const selected = page.locator('.wb:visible .wb-nav [aria-pressed=true]');
    const before = await selected.innerText();
    await page
      .getByRole('button', { name: 'New conversation', exact: true })
      .click();
    await expect(selected).not.toHaveText(before);
  };
  if (!recording) {
    await newConversation();
    await page
      .getByRole('button', { name: 'Two-step plan', exact: true })
      .click();
    await expect(cards).toHaveCount(2);
    expect(requests).toHaveLength(count);
  }
  if (!live) {
    for (const outcome of ['low', 'error'] as const) {
      await newConversation();
      options.outcome(outcome);
      await send.click();
      if (outcome === 'low') {
        await expect(cards).toHaveCount(1);
        await expect(cards).toContainText('Low confidence');
        await expect(
          cards.getByRole('button', { name: 'Use suggestion', exact: true }),
        ).toBeDisabled();
      } else await expect(page.getByRole('alert').first()).toBeVisible();
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await expect(inspection).toContainText('"revision": 0');
    }
    await newConversation();
    options.outcome('delay');
    await send.click();
    await expect(
      page.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(
      page.locator('.wb:visible .wb-chat .wb-panel-head'),
    ).toContainText('cancelled');
    await expect(page.getByRole('status')).toContainText(
      'Decision cancelled. Retry or review the plan manually.',
    );
    options.outcome('success');
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();
    await send.click();
    await expect(cards).toHaveCount(1);
    await expect(
      cards.getByRole('heading', { name: 'review', exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(400);
    await expect(cards).toHaveCount(1);
    await expect(
      cards.getByRole('button', { name: 'Use suggestion', exact: true }),
    ).toBeEnabled();
    await page.getByRole('tab', { name: 'State', exact: true }).click();
    await expect(inspection).toContainText('"revision": 0');
  }
  if (!recording) {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  const video = page.video();
  await page.close();
  if (video)
    await video.saveAs(
      resolve(work, `${framework}-decisions-${live ? 'live' : 'fixture'}.webm`),
    );
  return {
    framework,
    lesson: 'decisions',
    phases,
    source: live ? 'provider' : 'test-fixture',
    provider: live ? 'typesafe' : 'test-fixture',
    requests: captured.length,
    passed: true,
  };
}
