import { type AircraftSnapshot, cardGroups, routeSchema } from '@atc/shared';
import {
  createSelectionSchema,
  type DecidableSchema,
  type Decision,
  decodeDecision,
  ɵcompileDecision,
} from '@hashbrownai/core';
import type { BrowserContext, Page } from '@playwright/test';
import {
  CHART_AIRPORTS,
  CHART_AIRSPACE,
  chartSurfaces,
} from './chart-fixtures';
import { PROMPTS } from './model';

/**
 * Serves atc's data routes from the fixtures: aircraft frames from `frames`,
 * the chart fixtures, and no scheduled routes. `/api/decide` answers with
 * {@link scriptedRoute} and {@link scriptedCards}; a test that needs it to fail
 * calls {@link stubDecideUnavailable} afterwards. Map tiles load unless
 * `blockTiles`.
 */
export async function stubAtcFeeds(
  target: Page | BrowserContext,
  options: {
    readonly frames: (n: number) => AircraftSnapshot;
    readonly blockTiles: boolean;
  },
): Promise<void> {
  if (options.blockTiles) {
    await target.route('https://tile.openstreetmap.org/**', (route) =>
      route.abort(),
    );
  }
  await target.route('https://vrs-standing-data.adsb.lol/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await target.route('**/api/chart/airports', (route) =>
    route.fulfill({ json: CHART_AIRPORTS }),
  );
  await target.route('**/api/chart/surfaces**', (route) =>
    route.fulfill({
      json: chartSurfaces(
        new URL(route.request().url()).searchParams.get('airport') ?? '',
      ),
    }),
  );
  await target.route('**/api/chart/airspace', (route) =>
    route.fulfill({ json: CHART_AIRSPACE }),
  );
  await target.route('**/api/decide**', (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON() as { state?: unknown };

    return route.fulfill({
      json: scriptedDecision(url.searchParams.get('kind'), body.state),
    });
  });
  let next = 0;
  await target.route('**/api/aircraft**', (route) =>
    route.fulfill({ json: options.frames(next++) }),
  );
}

/**
 * Makes `/api/decide` answer 503 `unavailable`, as it does without a key, so
 * typed text goes to chat with every card. Call it after
 * {@link stubAtcFeeds}: the latest route wins. Returns the requests seen.
 */
export async function stubDecideUnavailable(
  target: Page | BrowserContext,
): Promise<{ readonly count: () => number }> {
  let seen = 0;
  await target.route('**/api/decide**', (route) => {
    seen++;

    return route.fulfill({ status: 503, json: { code: 'unavailable' } });
  });

  return { count: () => seen };
}

/** What the stubbed router decides about typed text. */
export interface ScriptedRoute {
  readonly intent: 'filter' | 'chat' | 'other';
  /** The confidence in `intent`, 0 to 1. */
  readonly confidence: number;
  /** The probability that the text asks to remove the current filter. */
  readonly clear: number;
}

/** The router's decision for `text`: filter, clear, or a question for chat. */
export function scriptedRoute(text: string): ScriptedRoute {
  if (text.includes(PROMPTS.clearFilter)) {
    return { intent: 'filter', confidence: 0.9, clear: 0.95 };
  }
  if (text.includes(PROMPTS.filterJets)) {
    return { intent: 'filter', confidence: 0.97, clear: 0.02 };
  }

  return { intent: 'chat', confidence: 0.91, clear: 0.02 };
}

/**
 * The probability of each card the stubbed cards decision gives `text`; a
 * card not named is unlikely. Only {@link PROMPTS.reasoned} and
 * {@link PROMPTS.seattleArrivals} are confident (0.5 or more); every other
 * text gets no confident card, so the apps send all of them.
 */
export function scriptedCards(text: string): Readonly<Record<string, number>> {
  if (text.includes(PROMPTS.reasoned)) {
    return { FlightCard: 0.9 };
  }
  if (text.includes(PROMPTS.seattleArrivals)) {
    return { ArrivalsBoard: 0.9, FlightCard: 0.6 };
  }

  return {};
}

/** The text a decision request is about: `state.input`, or the state itself. */
function textOf(state: unknown): string {
  if (typeof state === 'string') {
    return state;
  }
  if (typeof state === 'object' && state !== null) {
    const input = (state as { input?: unknown }).input;

    return typeof input === 'string' ? input : JSON.stringify(state);
  }

  return '';
}

/**
 * A real decision envelope for the route or cards question set, built from
 * the app's own schemas and verified with core's decoder, so a renamed
 * question or option fails here instead of silently routing to chat.
 */
function scriptedDecision(
  kind: string | null,
  state: unknown,
): Decision.Response {
  const text = textOf(state);
  if (kind === 'route') {
    const { intent, confidence, clear } = scriptedRoute(text);
    const questions = ɵcompileDecision(routeSchema);
    const question = questions['intent'];
    if (question?.type !== 'choice' || questions['clear']?.type !== 'yesNo') {
      throw new Error('The route schema no longer asks intent and clear');
    }
    const others = Object.keys(question.options).filter((o) => o !== intent);
    const probabilities = Object.fromEntries([
      [intent, confidence],
      ...others.map((o) => [o, (1 - confidence) / others.length]),
    ]);

    return verified(
      routeSchema,
      { intent, clear: clear >= 0.5 },
      { intent: { confidence, probabilities }, clear: { probability: clear } },
    );
  }
  if (kind === 'cards') {
    const schema = createSelectionSchema(cardGroups, { max: 2 });
    const asked = scriptedCards(text);
    const ids = Object.keys(ɵcompileDecision(schema));
    for (const name of Object.keys(asked)) {
      if (!ids.includes(name)) {
        throw new Error(`The cards schema has no question for ${name}`);
      }
    }
    const probability = (id: string) => asked[id] ?? 0.1;

    return verified(
      schema,
      Object.fromEntries(ids.map((id) => [id, probability(id) >= 0.5])),
      Object.fromEntries(
        ids.map((id) => [id, { probability: probability(id) }]),
      ),
    );
  }
  throw new Error(`Unexpected decision kind ${kind}`);
}

/** The envelope for `value` and `meta`, after core decodes it against `schema`. */
function verified(
  schema: DecidableSchema,
  value: Decision.Response['value'],
  meta: Decision.Response['meta'],
): Decision.Response {
  const response: Decision.Response = {
    kind: 'hashbrown.decision',
    version: 1,
    value,
    meta,
  };
  decodeDecision(schema, response);

  return response;
}
