import type { Page, Route } from '@playwright/test';
import { expect, test } from '../harness/test-fixture';

interface DecideRequest {
  readonly state: unknown;
  readonly questions: Record<string, unknown>;
}

const routeQuestions = {
  intent: {
    type: 'choice',
    instructions: 'Intent',
    options: { filter: 'Filter', chat: 'Chat' },
  },
  clear: { type: 'yesNo', instructions: 'Clear' },
};

function envelope(value: unknown, meta: unknown) {
  return { kind: 'hashbrown.decision', version: 1, value, meta };
}

function answer(request: DecideRequest) {
  if ('pick' in request.questions) {
    return envelope(
      { pick: 'weather' },
      {
        pick: {
          confidence: 0.8,
          probabilities: { weather: 0.8, stocks: 0.2 },
        },
      },
    );
  }

  return envelope(
    { intent: 'filter', clear: false },
    {
      intent: {
        confidence: 0.9,
        probabilities: { filter: 0.9, chat: 0.1 },
      },
      clear: { probability: 0.2 },
    },
  );
}

async function openDecision(
  page: Page,
  handler: (route: Route, request: DecideRequest) => Promise<void>,
): Promise<void> {
  await page.route('**/api/decide', (route) =>
    handler(route, route.request().postDataJSON() as DecideRequest),
  );
  const searchParams = new URLSearchParams({
    runUrl: 'http://127.0.0.1:9/',
    scenario: 'decision',
  });
  await page.goto(`/?${searchParams}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fixture-ready')).toBeVisible();
}

test('decides typed values with confidence from the stub', async ({ page }) => {
  const requests: DecideRequest[] = [];
  await openDecision(page, async (route, request) => {
    requests.push(request);
    await route.fulfill({ json: answer(request) });
  });

  await page.getByTestId('decision-input').fill('show only flights');

  await expect(page.getByTestId('decision-intent')).toHaveText('filter');
  await expect(page.getByTestId('decision-clear')).toHaveText('false');
  await expect(page.getByTestId('decision-confidence')).toHaveText('0.9');
  await expect(page.getByTestId('decision-error')).toHaveText('');
  const routeRequests = requests.filter(
    (request) => !('pick' in request.questions),
  );
  expect(routeRequests).toHaveLength(1);
  expect(routeRequests[0]).toEqual({
    state: 'show only flights',
    questions: routeQuestions,
  });
});

test('shows the error when the endpoint responds 500', async ({ page }) => {
  await openDecision(page, (route) => route.fulfill({ status: 500 }));

  await page.getByTestId('decision-input').fill('anything');

  await expect(page.getByTestId('decision-error')).not.toHaveText('');
  await expect(page.getByTestId('decision-intent')).toHaveText('');
});

test('renders only the chosen candidate', async ({ page }) => {
  await openDecision(page, async (route, request) => {
    await route.fulfill({ json: answer(request) });
  });

  await page.getByTestId('decision-input').fill('will it rain');

  await expect(page.getByTestId('candidate-weather')).toBeVisible();
  await expect(page.getByTestId('candidate-stocks')).toHaveCount(0);
  await expect(page.getByTestId('candidate-ids')).toHaveText('weather');
});
