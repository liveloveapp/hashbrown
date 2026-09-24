// Record several takes and commit the best complete one. Never hand-edit what the model said.
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type AgUiTape,
  parseSseEvents,
  validateTape,
} from '../server/src/fixture-tape';

const QUESTION = 'Which USD customers are more than 60 days overdue?';
const OUT = resolve(__dirname, 'recordings/overdue-60.agui.json');

test('records a real assistant answer for deterministic replay', async ({
  page,
}) => {
  const bodies: string[] = [];
  await page.route('**/agui/%2Fassistant%23agent', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    bodies.push(body);
    await route.fulfill({ response, body });
  });

  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Message assistant', exact: true })
    .fill(QUESTION);
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Reading your ledger…')).toHaveCount(0);
  await expect(page.locator('.assistant-answer').last()).toBeVisible();

  const tape: AgUiTape = {
    version: 1,
    recordedAt: new Date().toISOString(),
    question: QUESTION,
    events: parseSseEvents(bodies.join('')).map((event) => ({ event })),
  };

  const problems = validateTape(tape);
  expect(problems, problems.join(', ')).toEqual([]);

  await mkdir(resolve(__dirname, 'recordings'), { recursive: true });
  await writeFile(OUT, JSON.stringify(tape, null, 2) + '\n');
});
