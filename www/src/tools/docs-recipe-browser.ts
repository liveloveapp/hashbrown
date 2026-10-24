import type { RunAgentInput } from '@ag-ui/core';
import type { Decision } from '@hashbrownai/core';
import { expect, type Page } from '@playwright/test';
import type { RecipeOutcome } from './docs-recipe-fixtures';

/** The three checked clients recorded by this tool. */
export type RecipeMode =
  'magic-text' | 'predictive-suggestions' | 'ui-selection';

/** Configures the next deterministic response without replacing any client code. */
export interface RecipeScenario {
  readonly outcome?: RecipeOutcome;
  readonly delay?: number;
  readonly text?: string;
  readonly pick?: 'summary' | 'items';
  readonly confidence?: number;
}

/** A captured transport request and the observable stream phase reached by the fixture. */
export interface RecipeRequest {
  readonly kind: 'chat' | 'decision';
  readonly body: RunAgentInput | Decision.Request;
  readonly textEnded: boolean;
}

/** An action observed on the recording clock, before the two-second preview is added. */
export interface RecipePhase {
  readonly seconds: number;
  readonly text: string;
}

/** Request counters gate assertions on the new request rather than prior idle state. */
export interface RecipeFixtureControl {
  configure(scenario: RecipeScenario): void;
  count(): number;
  settled(): number;
  latest(): RecipeRequest | undefined;
}

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

/** Starts a request and observes transport activity before any completion assertion. */
export async function startRecipeRequest(
  page: Page,
  fixture: RecipeFixtureControl,
  name: string,
  scenario: RecipeScenario = {},
): Promise<void> {
  const before = fixture.count();
  fixture.configure(scenario);
  await button(page, name).click();
  await expect.poll(() => fixture.count()).toBe(before + 1);
}

/** Performs the visible happy path on the actual framework client. */
export async function demonstrateRecipe(
  page: Page,
  mode: RecipeMode,
  fixture: RecipeFixtureControl,
  phase: (text: string) => void = () => undefined,
): Promise<void> {
  if (mode === 'magic-text') {
    phase('Generate a Markdown packing reply.');
    await startRecipeRequest(page, fixture, 'Generate reply');
    const reply = page.getByRole('region', { name: 'Generated reply' });
    await expect(reply).toHaveAttribute('aria-busy', 'true');
    await expect(
      reply.getByRole('heading', { name: 'A small packing list' }),
    ).toBeVisible();
    await expect(reply.locator('a')).toHaveCount(0);
    await expect(button(page, 'Generate reply')).toBeEnabled();
    await expect(reply.locator('strong')).toContainText('a passport');
    await expect(reply.getByRole('listitem')).toHaveCount(2);
    phase('Open the citation.');
    await page.waitForTimeout(900);
    const citationUrl = page.url();
    const citationPages = page.context().pages().length;
    await reply.locator('a').filter({ hasText: '1' }).first().click();
    await expect(
      page.getByRole('complementary', { name: 'Source details' }),
    ).toContainText('https://hashbrown.dev');
    expect(page.url()).toBe(citationUrl);
    expect(page.context().pages()).toHaveLength(citationPages);
    phase('Inspect the source details. A citation does not verify the reply.');
  } else if (mode === 'predictive-suggestions') {
    phase('Request city packing suggestions.');
    await startRecipeRequest(page, fixture, 'Suggest city items');
    const city = predictionSnapshot(fixture);
    expect(city.context).toBe('city');
    expect(city.currentItemIds).toEqual([]);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(0);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(2);
    phase('Accept Passport.');
    await page.waitForTimeout(900);
    const count = fixture.count();
    await page
      .getByTestId('suggestions')
      .getByRole('listitem')
      .filter({ hasText: 'Passport' })
      .getByRole('button', { name: 'Accept', exact: true })
      .click();
    await expect(page.getByTestId('packing-list')).toContainText('Passport');
    phase('Dismiss Phone charger.');
    await page.waitForTimeout(900);
    await page
      .getByTestId('suggestions')
      .getByRole('button', { name: 'Dismiss', exact: true })
      .click();
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(0);
    await page.waitForTimeout(450);
    expect(fixture.count()).toBe(count);
    phase('Request hiking suggestions with Passport already packed.');
    await startRecipeRequest(page, fixture, 'Suggest hiking items');
    const hiking = predictionSnapshot(fixture);
    expect(hiking.context).toBe('hiking');
    expect(hiking.currentItemIds).toEqual(['passport']);
    expect(hiking.contextId).not.toBe(city.contextId);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(2);
    phase('Accept Water bottle. Suggestions never apply automatically.');
    await page.waitForTimeout(900);
    await page
      .getByTestId('suggestions')
      .getByRole('listitem')
      .filter({ hasText: 'Water bottle' })
      .getByRole('button', { name: 'Accept', exact: true })
      .click();
    await expect(
      page.getByTestId('packing-list').getByRole('listitem'),
    ).toHaveText(['Passport', 'Water bottle']);
    phase('The local packing list contains Passport and Water bottle.');
  } else {
    phase('Ask for a quick overview.');
    await startRecipeRequest(page, fixture, 'Choose a view', {
      pick: 'summary',
    });
    assertSelectionRequest(fixture, 'Show a quick overview.');
    await expect(
      page.getByRole('region', { name: 'Summary card' }),
    ).toBeVisible();
    phase('Summary selected.');
    await page.waitForTimeout(900);
    await page
      .getByLabel('What would you like to see?')
      .fill('Show each product and its quantity.');
    phase('Ask to see every product and quantity.');
    await startRecipeRequest(page, fixture, 'Choose a view', { pick: 'items' });
    assertSelectionRequest(fixture, 'Show each product and its quantity.');
    await expect(page.getByRole('region', { name: 'Item list' })).toContainText(
      '2 × Apples',
    );
    await expect(
      page.getByRole('region', { name: 'Summary card' }),
    ).toHaveCount(0);
    phase('The app-owned item list shows Apples and Bread.');
  }
}

/** Exercises adverse runs and recovery without allowing generated output to write state. */
export async function verifyRecipe(
  page: Page,
  mode: RecipeMode,
  fixture: RecipeFixtureControl,
): Promise<void> {
  await demonstrateRecipe(page, mode, fixture);
  if (mode === 'magic-text') {
    for (const outcome of ['failed', 'partial'] as const) {
      await startRecipeRequest(page, fixture, 'Generate reply', { outcome });
      await expect(page.getByRole('status')).toContainText('failed');
      await expect(button(page, 'Generate reply')).toBeEnabled();
    }
    await startRecipeRequest(page, fixture, 'Generate reply', {
      outcome: 'truncated',
    });
    await expect(page.getByRole('status')).toContainText('ended early');
    await expect(button(page, 'Generate reply')).toBeEnabled();
    await startRecipeRequest(page, fixture, 'Generate reply', { delay: 1700 });
    await expect(
      page.getByRole('region', { name: 'Generated reply' }),
    ).toContainText('passport');
    await button(page, 'Cancel').click();
    await expect(page.getByRole('status')).toContainText('Stopped');
    await startRecipeRequest(page, fixture, 'Generate reply', {
      text: '## Replacement\n\nA **fresh** reply.',
    });
    await expect(button(page, 'Generate reply')).toBeEnabled();
    await expect(
      page.getByRole('region', { name: 'Generated reply' }),
    ).toContainText('Replacement');
    await expect(
      page.getByRole('region', { name: 'Generated reply' }),
    ).not.toContainText('passport');
    await page.waitForTimeout(1800);
    await expect(
      page.getByRole('region', { name: 'Generated reply' }),
    ).not.toContainText('passport');
    await expect(
      page.getByRole('complementary', { name: 'Source details' }),
    ).toHaveCount(0);
    await startRecipeRequest(page, fixture, 'Generate reply', {
      outcome: 'unsafe',
      text: '<img src=x onerror="window.recipeUnsafe=true">\n\n[unsafe](javascript:window.recipeUnsafe=true)',
    });
    await expect(button(page, 'Generate reply')).toBeEnabled();
    expect(
      await page.evaluate(() => Reflect.get(window, 'recipeUnsafe')),
    ).toBeUndefined();
    await expect(
      page
        .getByRole('region', { name: 'Generated reply' })
        .locator('img,script,a[href^="javascript:"]'),
    ).toHaveCount(0);
    await demonstrateRecipe(page, mode, fixture);
  } else if (mode === 'predictive-suggestions') {
    const applied = await page
      .getByTestId('packing-list')
      .getByRole('listitem')
      .allTextContents();
    for (const outcome of [
      'invalid',
      'malformed',
      'failed',
      'partial',
      'truncated',
      'stale',
      'empty',
      'no-answer',
    ] as const) {
      const beforeSettled = fixture.settled();
      await startRecipeRequest(page, fixture, 'Suggest city items', {
        outcome,
      });
      await expect.poll(() => fixture.settled()).toBeGreaterThan(beforeSettled);
      await expect(page.getByRole('status')).not.toContainText(
        'Finding suggestions',
      );
      await expect(
        page.getByTestId('suggestions').getByRole('listitem'),
      ).toHaveCount(0);
      await expect(
        page.getByTestId('packing-list').getByRole('listitem'),
      ).toHaveText(applied);
    }
    await startRecipeRequest(page, fixture, 'Suggest city items', {
      outcome: 'duplicates',
    });
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(1);
    await expect(page.getByTestId('suggestions')).toContainText(
      'Phone charger',
    );
    const noFeedbackCount = fixture.count();
    await page
      .getByTestId('suggestions')
      .getByRole('button', { name: 'Dismiss', exact: true })
      .click();
    await page.waitForTimeout(450);
    expect(fixture.count()).toBe(noFeedbackCount);
    await startRecipeRequest(page, fixture, 'Suggest city items', {
      delay: 1700,
    });
    await button(page, 'Suggest hiking items').click();
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(0);
    await expect.poll(() => fixture.count()).toBe(noFeedbackCount + 2);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(1);
    await expect(page.getByTestId('suggestions')).toContainText('Sunscreen');
    await page.waitForTimeout(1800);
    await expect(page.getByTestId('suggestions')).not.toContainText(
      'Phone charger',
    );
    await startRecipeRequest(page, fixture, 'Suggest city items', {
      delay: 1700,
    });
    // The server sent a full schema-valid JSON document, but RUN_FINISHED is paused.
    await expect.poll(() => fixture.latest()?.textEnded).toBe(true);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Finding suggestions');
    await button(page, 'Cancel').click();
    await expect(page.getByRole('status')).toContainText('cancelled');
    await page.waitForTimeout(1800);
    await expect(
      page.getByTestId('suggestions').getByRole('listitem'),
    ).toHaveCount(0);
    await expect(
      page.getByTestId('packing-list').getByRole('listitem'),
    ).toHaveText(applied);
    await startRecipeRequest(page, fixture, 'Suggest hiking items');
    await expect(page.getByTestId('suggestions')).toContainText('Sunscreen');
  } else {
    for (const scenario of [
      { confidence: 0.55 },
      { outcome: 'failed' as const },
    ]) {
      await startRecipeRequest(page, fixture, 'Choose a view', scenario);
      await expect(page.getByRole('status')).toContainText(
        scenario.outcome ? 'Could not' : 'No confident',
      );
      await expect(page.getByRole('region', { name: 'Item list' })).toHaveCount(
        0,
      );
      await button(page, 'Show items').click();
      await expect(
        page.getByRole('region', { name: 'Item list' }),
      ).toContainText('1 × Bread');
    }
    await startRecipeRequest(page, fixture, 'Choose a view', {
      pick: 'summary',
      delay: 1700,
    });
    await button(page, 'Show items').click();
    await expect(page.getByRole('status')).toContainText('Manual');
    await page.waitForTimeout(1800);
    await expect(page.getByRole('region', { name: 'Item list' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Summary card' }),
    ).toHaveCount(0);
    await startRecipeRequest(page, fixture, 'Choose a view', {
      pick: 'summary',
      delay: 1700,
    });
    await startRecipeRequest(page, fixture, 'Choose a view', { pick: 'items' });
    await expect(page.getByRole('region', { name: 'Item list' })).toBeVisible();
    await page.waitForTimeout(1800);
    await expect(
      page.getByRole('region', { name: 'Summary card' }),
    ).toHaveCount(0);
    await startRecipeRequest(page, fixture, 'Choose a view', {
      pick: 'summary',
    });
    await expect(
      page.getByRole('region', { name: 'Summary card' }),
    ).toBeVisible();
  }
}

function predictionSnapshot(fixture: RecipeFixtureControl) {
  const request = fixture.latest();
  expect(request?.kind).toBe('chat');
  const input = request?.body as RunAgentInput;
  const user = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user');
  expect(typeof user?.content).toBe('string');
  if (typeof user?.content !== 'string')
    throw new Error('Expected serialized prediction input');
  const snapshot = JSON.parse(user.content) as {
    contextId: string;
    context: string;
    currentItemIds: string[];
  };
  expect(snapshot.contextId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return snapshot;
}

function assertSelectionRequest(fixture: RecipeFixtureControl, prompt: string) {
  const request = fixture.latest();
  expect(request?.kind).toBe('decision');
  const input = request?.body as Decision.Request;
  const state = input.state as unknown as {
    system?: string;
    input?: unknown;
    prompt?: string;
    requestId?: string;
  };
  const snapshot = (state.input ?? state) as {
    prompt: string;
    requestId: string;
  };
  expect(snapshot.prompt).toBe(prompt);
  expect(snapshot.requestId).toEqual(expect.any(String));
  const questions = Object.values(input.questions);
  expect(questions).toHaveLength(1);
  expect(questions[0].type).toBe('choice');
  if (questions[0].type !== 'choice')
    throw new Error('Expected a choice question');
  expect(Object.keys(questions[0].options)).toEqual(['summary', 'items']);
  expect(Object.values(questions[0].options)).toEqual([
    'Show an overview with product and item totals.',
    'Show each product name and its quantity in a list.',
  ]);
}
