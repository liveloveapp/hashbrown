import { expect, type Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Regenerate by hand after the tape or the invoicing UI changes:
//   npx nx stills invoicing-e2e
// Stills are committed; CI never rewrites them.
const OUT = resolve(__dirname, '../../../www/analog/public/image/landing-page');
const QUESTION = 'Which USD customers are more than 60 days overdue?';
const BUDGET = 150 * 1024;

async function ask(page: Page) {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Message assistant', exact: true })
    .fill(QUESTION);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const answer = page.locator('.assistant-answer').last();
  await expect(answer).toBeVisible();
  await expect(page.getByText('Reading your ledger…')).toHaveCount(0);
  await expect(answer.locator('[data-pretable-row]').first()).toBeVisible();
  await expect(
    answer
      .locator('[data-bucket="days61to90"], [data-bucket="over90"]')
      .first(),
  ).toBeVisible();
  await page.waitForTimeout(400);
  return answer;
}

async function save(png: Buffer, name: string, width: number) {
  const webp = await sharp(png)
    .resize({ width })
    .webp({ quality: 70, effort: 6 })
    .toBuffer();
  expect(webp.byteLength, `${name} over budget`).toBeLessThanOrEqual(BUDGET);
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, name), webp);
}

/**
 * Bring the conversation's question into view at the top, rather than the
 * last answer (which would push the question and opening prose above the
 * fold): the still must show the question, the prose and the rendered
 * components together. Scrolling can shift what's under a stationary
 * pointer enough for Chrome to re-fire hover events on the chart beneath
 * it, so the pointer is parked over neutral chrome before the screenshot.
 */
async function frameConversation(page: Page) {
  // scrollIntoViewIfNeeded only scrolls the minimal distance (nearest edge),
  // which can leave the question near the bottom of the fold; block: 'start'
  // pins it to the top so the prose and rendered components below it show.
  await page
    .getByRole('region', { name: 'Ledger conversation' })
    .locator('p')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.move(5, 5);
}

test('desktop still', async ({ browser }) => {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 875 },
    deviceScaleFactor: 2,
  });
  await ask(page);
  await frameConversation(page);
  await save(await page.screenshot(), 'invoicing.webp', 1400);
  await page.close();
});

test('mobile still', async ({ browser }) => {
  // Tall enough that with the question pinned to the top, the opening prose
  // and the top of the rendered components still fit below it.
  const page = await browser.newPage({
    viewport: { width: 390, height: 1100 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await ask(page);
  await frameConversation(page);
  await save(await page.screenshot(), 'invoicing-mobile.webp', 585);
  await page.close();
});
