import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseServerTiming, type PerfRun, summarize } from './stats';

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const QUESTIONS = [
  'How much cash is still unapplied?',
  'Which clients pay late?',
  'How did invoicing trend over the last 6 months?',
];
const OUT = resolve(
  __dirname,
  '../../../../test-results/examples/invoicing-perf/perf.json',
);

/** Milliseconds `until` takes to resolve after `action` starts. */
async function timed(
  action: () => Promise<unknown>,
  until: () => Promise<unknown>,
) {
  const start = Date.now();
  await action();
  await until();
  return Date.now() - start;
}

async function ask(page: Page, question: string) {
  const answers = page.locator('.assistant-answer');
  const before = await answers.count();
  const message = page.getByRole('textbox', {
    name: 'Message assistant',
    exact: true,
  });
  await expect(message).toBeEnabled();
  await message.fill(question);
  const start = Date.now();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(answers.nth(before).locator('p').first()).not.toBeEmpty();
  const firstText = Date.now() - start;
  await expect(message).toBeEnabled();
  return { question, firstText, settled: Date.now() - start };
}

async function scenario(page: Page): Promise<PerfRun> {
  await page.goto('/');
  // Navigation start is 0 on the page's own clock, so this is load-to-figures.
  await page.waitForFunction(() =>
    document.querySelector('.kpi-strip strong')?.textContent?.includes('$'),
  );
  const dashboardData = await page.evaluate(() => performance.now());
  const header = await page.evaluate(() => {
    const entry = performance
      .getEntriesByType('resource')
      .find((e) => e.name.endsWith('/api/snapshot')) as
      PerformanceResourceTiming | undefined;
    return (entry?.serverTiming ?? [])
      .map((t) => `${t.name};dur=${t.duration}`)
      .join(', ');
  });

  const questions = [];
  for (const question of QUESTIONS) questions.push(await ask(page, question));

  await page.getByRole('tab', { name: /^Unapplied/ }).click();
  await page
    .getByRole('treegrid', { name: 'Unapplied payments', exact: true })
    .locator('[data-pretable-row-id="payment-harbor-combined"]')
    .click();
  const approve = page.getByRole('button', {
    name: 'Approve and apply',
    exact: true,
  });
  const approvalCard = await timed(
    () =>
      page.getByRole('button', { name: 'Review match', exact: true }).click(),
    () => expect(approve.last()).toBeEnabled(),
  );
  // The review collapses once applied; its visible outcome line is "Applied $…".
  const applied = await timed(
    () => approve.last().click(),
    () => expect(page.getByText(/^Applied \$/).last()).toBeVisible(),
  );

  return {
    dashboardData,
    snapshotServer: parseServerTiming(header),
    questions,
    approvalCard,
    applied,
  };
}

test(`performance scenario, ${RUNS} fresh sessions`, async ({ browser }) => {
  const runs: PerfRun[] = [];

  for (let i = 0; i < RUNS; i++) {
    // A fresh context is a fresh session, so Harbor's payment is unapplied again.
    const context = await browser.newContext();
    try {
      runs.push(await scenario(await context.newPage()));
    } finally {
      await context.close();
    }
  }

  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ runs }, null, 2));
  console.log(`\n${summarize(runs)}\n\nRaw runs: ${OUT}`);
  expect(runs).toHaveLength(RUNS);
});
