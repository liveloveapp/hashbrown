/**
 * Live prose eval: asks each starter prompt several times through the real
 * app (the model's tools run in the browser, so it drives the page) and
 * reports prose that leaks rules, names components or tools, stops on a
 * colon or promises a tap the app doesn't have, and answers that show
 * aircraft but leave none highlighted on the map. It calls the real model, so
 * it needs `OPENAI_API_KEY` and the dev servers (`npx nx serve atc-server`,
 * `npx nx serve atc-angular`), and it costs a little each run.
 *
 *   npx nx prose-eval atc-e2e -- --runs 8 --concurrency 3
 *   npx nx prose-eval atc-e2e -- --runs 12 --only highest
 *
 * Exits 1 when any answer has an issue, and writes every answer to
 * `test-results/atc/prose-eval.json` for reading by eye.
 */
import { STARTER_PROMPTS } from '@atc/shared';
import { type Browser, chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { mapIssues, type ProseIssue, proseIssues } from './prose-check';

interface Answer {
  readonly prompt: string;
  readonly prose: readonly string[];
  /** The activity line's summary, such as "Searched traffic, highlighted 2 aircraft". */
  readonly steps?: string;
  readonly issues: readonly ProseIssue[];
  readonly error?: string;
}

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '4' },
    concurrency: { type: 'string', default: '3' },
    url: { type: 'string', default: 'http://127.0.0.1:4341/angular/' },
    out: { type: 'string', default: 'test-results/atc/prose-eval.json' },
    /** Only the starters containing this text, such as "highest". */
    only: { type: 'string', default: '' },
  },
});

/** Asks one question in a fresh page and returns the answer's prose. */
async function ask(browser: Browser, prompt: string): Promise<Answer> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(values.url);
    await page
      .getByTestId('airspace-map')
      .and(page.locator('[data-ready]'))
      .waitFor({ timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForSelector('[aria-busy="true"]', { timeout: 10_000 });
    await page.waitForFunction(
      () => !document.querySelector('[aria-busy="true"]'),
      null,
      { timeout: 150_000 },
    );
    const prose = await page
      .locator('.atc-prose')
      .evaluateAll((elements) =>
        elements
          .map((element) => (element as HTMLElement).innerText.trim())
          .filter(Boolean),
      );
    const steps = await page
      .getByTestId('tool-summary')
      .last()
      .innerText()
      .catch(() => '');
    const map = await page.evaluate(() => ({
      shown: document.querySelectorAll(
        '[data-testid="arrivals-row"], [data-testid="flight-card"], [data-testid="aircraft-compare"]',
      ).length,
      highlighted: document.querySelectorAll('.atc-plane.is-highlighted')
        .length,
    }));
    return {
      prompt,
      prose,
      steps,
      issues: [
        ...proseIssues(prose),
        ...mapIssues({
          ...map,
          clearedUnasked:
            /cleared the highlight/i.test(steps) &&
            !/\b(clear|reset)\b/i.test(prompt),
        }),
      ],
    };
  } catch (error) {
    return { prompt, prose: [], issues: [], error: String(error) };
  } finally {
    await context.close();
  }
}

/** Asks every starter `runs` times, reports issues and sets the exit code. */
async function main(): Promise<void> {
  const prompts = STARTER_PROMPTS.filter((prompt) =>
    prompt.toLowerCase().includes(values.only.toLowerCase()),
  );
  const queue = Array.from({ length: Number(values.runs) }).flatMap(
    () => prompts,
  );
  const browser = await chromium.launch();
  const answers: Answer[] = [];
  await Promise.all(
    Array.from({ length: Number(values.concurrency) }, async () => {
      for (let prompt = queue.shift(); prompt; prompt = queue.shift()) {
        answers.push(await ask(browser, prompt));
      }
    }),
  );
  await browser.close();

  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify(answers, null, 2));

  const flagged = answers.filter((answer) => answer.issues.length > 0);
  const failed = answers.filter((answer) => answer.error);
  console.log(
    `${answers.length} answers, ${flagged.length} with issues, ${failed.length} errors; all answers in ${values.out}`,
  );
  for (const answer of flagged) {
    for (const issue of answer.issues) {
      console.log(`  [${issue.kind}] ${answer.prompt} => ${issue.text}`);
    }
  }
  for (const answer of failed) {
    console.log(`  [error] ${answer.prompt} => ${answer.error}`);
  }
  process.exitCode = flagged.length > 0 || failed.length > 0 ? 1 : 0;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
