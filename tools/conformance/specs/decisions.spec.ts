import type { Page, Route } from '@playwright/test';
import {
  type BrowserHygiene,
  type BrowserHygieneOptions,
  installBrowserHygiene,
} from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

interface DecideRequest {
  readonly state: unknown;
  readonly questions: Record<string, unknown>;
}

const pickQuestions = {
  pick: {
    type: 'choice',
    instructions: 'Which one fits the input best',
    options: { weather: 'Weather questions', stocks: 'Stock questions' },
  },
};

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
  hygieneOptions?: BrowserHygieneOptions,
): Promise<BrowserHygiene> {
  const hygiene = installBrowserHygiene(page, hygieneOptions);
  await page.route('**/api/decide', (route) =>
    handler(route, route.request().postDataJSON() as DecideRequest),
  );
  const searchParams = new URLSearchParams({
    runUrl: 'http://127.0.0.1:9/',
    scenario: 'decision',
  });
  await page.goto(`/?${searchParams}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fixture-ready')).toBeVisible();

  return hygiene;
}

test('decides typed values with confidence from the stub', async ({ page }) => {
  const requests: DecideRequest[] = [];
  const hygiene = await openDecision(page, async (route, request) => {
    requests.push(request);
    await route.fulfill({ json: answer(request) });
  });

  await page.getByTestId('decision-input').fill('show only flights');

  await expect(page.getByTestId('decision-intent')).toHaveText('filter');
  await expect(page.getByTestId('decision-clear')).toHaveText('false');
  await expect(page.getByTestId('decision-confidence')).toHaveText('0.9');
  await expect(page.getByTestId('decision-error')).toHaveText('');
  await expect(page.getByTestId('candidate-ids')).toHaveText('weather');
  expect(requests).toHaveLength(2);
  expect(requests).toContainEqual({
    state: 'show only flights',
    questions: routeQuestions,
  });
  expect(requests).toContainEqual({
    state: 'show only flights',
    questions: pickQuestions,
  });
  await hygiene.assertClean();
});

test('shows the error when the endpoint responds 500', async ({ page }) => {
  const isDecide = (url: string) => new URL(url).pathname === '/api/decide';
  const hygiene = await openDecision(
    page,
    async (route, request) => {
      if ('pick' in request.questions) {
        await route.fulfill({ json: answer(request) });
        return;
      }
      await route.fulfill({ status: 500 });
    },
    {
      requestFailureAllowances: [
        {
          reason: 'the client abandons the intentional 500 response body',
          matches: (request) =>
            request.method() === 'POST' &&
            isDecide(request.url()) &&
            request.failure()?.errorText === 'net::ERR_ABORTED' &&
            !('pick' in (request.postDataJSON() as DecideRequest).questions),
        },
      ],
      httpErrorAllowances: [
        {
          reason: 'the stub intentionally fails the route decision',
          matches: (response) =>
            response.status() === 500 &&
            response.request().method() === 'POST' &&
            isDecide(response.url()) &&
            !(
              'pick' in
              (response.request().postDataJSON() as DecideRequest).questions
            ),
        },
      ],
      consoleErrorAllowances: [
        {
          reason: 'Chromium reports the intentional 500 response',
          matches: (message) =>
            message.text().includes('status of 500') &&
            isDecide(message.location().url),
        },
      ],
    },
  );

  await page.getByTestId('decision-input').fill('anything');

  await expect(page.getByTestId('decision-error')).not.toHaveText('');
  await expect(page.getByTestId('decision-intent')).toHaveText('');
  await hygiene.assertClean();
});

test('renders only the chosen candidate', async ({ page }) => {
  const hygiene = await openDecision(page, async (route, request) => {
    await route.fulfill({ json: answer(request) });
  });

  await page.getByTestId('decision-input').fill('will it rain');

  await expect(page.getByTestId('candidate-weather')).toBeVisible();
  await expect(page.getByTestId('candidate-stocks')).toHaveCount(0);
  await expect(page.getByTestId('candidate-ids')).toHaveText('weather');
  await hygiene.assertClean();
});
