import { expect, type Locator, type Page, test } from '@playwright/test';
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

test('desktop still', async ({ browser }) => {
  // The window stays at scroll top so the app's own chrome (the "Studio"
  // brand, nav, and the assistant column's "Assistant" title) frames the
  // still; a taller-than-usual viewport, rather than scrolling, is what
  // brings the rendered components into view below the question. The
  // assistant column has no independent scroll container of its own
  // (`.assistant`/`.assistant-body` have no `overflow`), so the whole
  // window is what would otherwise have to scroll.
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
    deviceScaleFactor: 2,
  });
  await ask(page);
  // Nothing scrolled, but rest the pointer over neutral chrome anyway so a
  // stray hover state from the click on Send can't tooltip the chart.
  await page.mouse.move(5, 5);
  await save(await page.screenshot(), 'invoicing.webp', 1400);
  await page.close();
});

/**
 * Shrink the rendered `LedgerTable`'s own scroll viewport (a `height: 320px;
 * overflow: auto` element Pretable sizes itself) so fewer rows show. This is
 * purely cosmetic for the screenshot: it doesn't affect what ships, only
 * what's visible while the mobile still is captured, which otherwise can't
 * fit the question, prose, table and chart within a phone-sized still.
 */
async function shrinkLedgerTable(answer: Locator, heightPx: number) {
  await answer
    .locator('[data-pretable-scroll-viewport]')
    .first()
    .evaluate((el, height) => {
      (el as HTMLElement).style.height = `${height}px`;
    }, heightPx);
}

test('mobile still', async ({ browser }) => {
  // Tall enough that the clip region (computed below, well past the
  // question) never exceeds the viewport: `page.screenshot({ clip })` can
  // only capture what the viewport actually rendered, and silently clamps
  // to the viewport's bottom edge rather than erroring if the clip runs
  // past it.
  const page = await browser.newPage({
    viewport: { width: 390, height: 2800 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const answer = await ask(page);
  // The mobile still drops the customer card and composer below the chart
  // (a phone-sized still has no room for them) and, even so, the ledger
  // table's full 320px viewport leaves no room for the chart underneath, so
  // it's shrunk to a few rows here — this is what the plan's "let the table
  // show fewer rows" means in practice.
  await shrinkLedgerTable(answer, 190);
  await page.mouse.move(5, 5);

  const question = page
    .getByRole('region', { name: 'Ledger conversation' })
    .locator('p')
    .first();
  const chartDetails = answer
    .locator('.assistant-kit-chart')
    .last()
    .locator('details');
  const [questionBox, detailsBox] = await Promise.all([
    question.boundingBox(),
    chartDetails.boundingBox(),
  ]);
  const viewport = page.viewportSize();
  if (!questionBox || !detailsBox || !viewport)
    throw new Error('Could not measure the conversation bounds to clip.');

  const clip = {
    x: 0,
    y: Math.max(0, questionBox.y - 10),
    width: viewport.width,
    height:
      detailsBox.y + detailsBox.height - Math.max(0, questionBox.y - 10) + 8,
  };
  await save(await page.screenshot({ clip }), 'invoicing-mobile.webp', 585);
  await page.close();
});
