import type { Browser, Locator, Page } from '@playwright/test';
import { capture, type Capture } from './capture';
import { installOverlay } from './overlay';
import type { Timeline } from './timeline';

const VIEWPORT = { width: 1440, height: 810 };
const ASSISTANT_ZOOM = 1.28;
const MODEL_TIMEOUT = 90_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Move the presenter cursor to a target in a visible arc, then click it. */
async function glide(page: Page, target: Locator, click = true) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('walkthrough target has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 28,
  });
  await pause(140);
  if (!click) return;
  await page.mouse.down();
  await pause(70);
  await page.mouse.up();
}

const caption = (page: Page, title: string, subtitle = '') =>
  page.evaluate(([t, s]) => window.__caption?.(t, s), [title, subtitle]);
const zoom = (page: Page, selector: string | null) =>
  page.evaluate(([sel, k]) => window.__zoom?.(sel, k), [
    selector,
    ASSISTANT_ZOOM,
  ] as const);
const follow = (page: Page, on: boolean) =>
  page.evaluate((value) => window.__follow?.(value), on);
const answerCount = (page: Page) => page.locator('.assistant-answer').count();

/** Fast-forward the model's tool calls, then play its stream near real time. */
async function awaitAnswer(page: Page, rec: Capture, before: number) {
  rec.mark(8, 'thinking');
  await follow(page, true);
  await page.waitForFunction(
    (n) => document.querySelectorAll('.assistant-answer').length > n,
    before,
    { timeout: MODEL_TIMEOUT },
  );
  rec.mark(1.6, 'streaming');
  await page
    .getByText('Reading your ledger…')
    .waitFor({ state: 'detached', timeout: MODEL_TIMEOUT });
  await pause(700);
  await follow(page, false);
  rec.mark(1, 'settled');
  await pause(300);
}

async function ask(page: Page, rec: Capture, question: string) {
  await glide(page, page.getByRole('textbox', { name: 'Message assistant' }));
  await page.keyboard.type(question, { delay: 28 });
  await pause(250);
  const before = await answerCount(page);
  await page.keyboard.press('Enter');
  await zoom(page, '.assistant');
  await awaitAnswer(page, rec, before);
}

/**
 * Drive the invoicing app through the walkthrough against a live model:
 * a starter question, a typed chart question, then a combined payment
 * matched through one approval. Returns the capture's timeline.
 */
export async function recordApp(
  browser: Browser,
  appUrl: string,
  dir: string,
): Promise<Timeline> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  // tsx compiles with esbuild's keepNames, which wraps named functions in
  // a module-scope `__name` helper the page doesn't have; stub it.
  await context.addInitScript({
    content: `var __name = (f) => f; (${installOverlay.toString()})();`,
  });
  const page = await context.newPage();
  await page.goto(appUrl);
  await page.getByRole('heading', { name: 'Business overview' }).waitFor();
  await page.mouse.move(700, 420);
  await pause(800);

  const rec = await capture(page, dir);
  rec.mark(1, 'intro');
  await caption(
    page,
    'An invoicing app with a hashbrown assistant',
    'React · streaming · generative UI',
  );
  await pause(1200);
  await glide(page, page.locator('.stats'), false);
  await pause(700);

  await caption(
    page,
    'Ask in plain language',
    'Starter questions send with one click',
  );
  await pause(500);
  const before = await answerCount(page);
  await glide(
    page,
    page.getByRole('button', { name: 'How much cash is still unapplied?' }),
  );
  await zoom(page, '.assistant');
  await caption(
    page,
    'The model calls read-only tools…',
    'then streams its answer as UI',
  );
  await awaitAnswer(page, rec, before);
  await caption(
    page,
    'Streamed straight into the UI',
    'Prose and components, validated by the server',
  );
  await pause(2600);
  await zoom(page, null);
  await pause(500);

  await caption(
    page,
    'Components are picked by the model',
    'From a kit you expose — nothing else renders',
  );
  await ask(page, rec, 'How did invoicing trend over the last 6 months?');
  await caption(
    page,
    'A chart, chosen by the model',
    'Typed props from Skillet schemas',
  );
  await pause(2600);
  await zoom(page, null);
  await pause(400);

  await caption(
    page,
    'The assistant sees what you select',
    'Page state flows into the chat',
  );
  await glide(
    page,
    page.getByRole('button', { name: 'Payments', exact: true }),
  );
  await page.getByRole('heading', { name: 'Payments', level: 1 }).waitFor();
  await pause(600);
  await glide(
    page,
    page.getByRole('button', { name: 'Review payment-harbor-combined' }),
  );
  await pause(900);
  await caption(
    page,
    'Ask about “this payment”',
    'The selection reaches the model as context',
  );
  await ask(page, rec, 'Which invoices does this payment cover?');
  await caption(
    page,
    'Answers come with actions',
    'One button for a payment that covers two invoices',
  );
  const match = page.getByRole('button', { name: /^Match to / }).last();
  await match.scrollIntoViewIfNeeded();
  await pause(2000);

  await glide(page, match);
  await caption(
    page,
    'Human in the loop',
    'The server prepares the proposal and pauses for approval',
  );
  rec.mark(8, 'preparing');
  await follow(page, true);
  const approve = page.getByRole('button', { name: 'Approve and apply' });
  await approve.waitFor({ state: 'visible', timeout: MODEL_TIMEOUT });
  await page.waitForFunction(
    () =>
      !(
        document.querySelector(
          '.proposal-card button.primary',
        ) as HTMLButtonElement | null
      )?.disabled,
    null,
    { timeout: MODEL_TIMEOUT },
  );
  rec.mark(1, 'proposal');
  await follow(page, false);
  await page.locator('.proposal-card').scrollIntoViewIfNeeded();
  await pause(2400);
  await glide(page, approve);
  rec.mark(5, 'applying');
  await follow(page, true);
  await page.getByText(/^Applied \$/).waitFor({ timeout: 60_000 });
  await pause(600);
  await follow(page, false);
  rec.mark(1, 'applied');
  await caption(
    page,
    'Applied across both invoices, atomically',
    'The ledger refreshes. No IDs, no guesswork.',
  );
  await pause(2600);
  await zoom(page, null);
  await pause(600);
  await caption(page, 'The grid agrees', 'Harbor’s payment now reads Matched');
  await glide(page, page.locator('.payment-grid'), false);
  await pause(2200);
  await caption(page, '');
  await pause(500);
  const timeline = await rec.stop();
  await context.close();
  return timeline;
}
