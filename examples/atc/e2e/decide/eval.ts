/**
 * Live decide eval: sends labelled probes to TypeSafe Jev exactly as
 * `/api/decide` does (the pinned model, schema and context per kind) and
 * scores them the way the apps act on the answer. The router sets count a
 * probe right when Enter would send it where its label says; the cards set
 * counts a probe right when the decision is confident and its best pick is
 * the expected card. It calls the real decision API, so it needs
 * `TYPESAFE_API_KEY` (no dev servers), and it costs a little each run.
 *
 *   npx nx decide-eval atc-e2e
 *   npx nx decide-eval atc-e2e -- --only cards
 *
 * Exits 1 when any set falls below its threshold in
 * {@link DECIDE_EVAL_THRESHOLDS}, and writes every outcome to
 * `test-results/atc/decide-eval.json`.
 */
import {
  cardGroups,
  CARDS_CONTEXT,
  CARDS_SELECT_MAX,
  ROUTE_CONTEXT,
  routeSchema,
} from '@atc/shared';
import { createSelectionSchema, type DecidableSchema } from '@hashbrownai/core';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CARDS_PROBES,
  type CardsOutcome,
  correctCount,
  DECIDE_EVAL_THRESHOLDS,
  HELD_OUT_ROUTE_PROBES,
  ROUTE_PROBES,
  type RouteOutcome,
  scoreCards,
  scoreRoute,
} from './probes';

/** A probe whose request kept failing; it counts as wrong. */
interface Failed {
  readonly input: string;
  readonly ok: false;
  readonly error: string;
}

/** How any probe came out. */
type Outcome = RouteOutcome | CardsOutcome | Failed;

/** The Jev version `server/src/decide-handler.ts` pins; keep them equal. */
const DECIDE_MODEL = 'jev-1.14.0';

/** The request bound `server/src/decide-handler.ts` applies. */
const MAX_REQUEST_CHARS = 4000;

const { values } = parseArgs({
  options: {
    concurrency: { type: 'string', default: '5' },
    out: { type: 'string', default: 'test-results/atc/decide-eval.json' },
    /** Only one kind: `route` or `cards`. */
    only: { type: 'string', default: '' },
  },
});

const apiKey = process.env['TYPESAFE_API_KEY'] ?? '';

/** Asks Jev once, retrying twice on a failed request. */
async function decide(
  schema: DecidableSchema,
  system: string,
  input: string,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await HashbrownTypeSafe.decide({
        apiKey,
        model: DECIDE_MODEL,
        schema,
        request: { state: { system, input } },
        maxRequestChars: MAX_REQUEST_CHARS,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Runs `task` over `items` with a fixed number of workers, keeping order. */
async function pool<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Number(values.concurrency) }, async () => {
      for (let index = next++; index < items.length; index = next++) {
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

/** Scores a router set; a request that keeps failing counts as wrong. */
function routeSet(
  probes: typeof ROUTE_PROBES,
): Promise<(RouteOutcome | Failed)[]> {
  return pool(probes, async (probe) => {
    try {
      const result = await decide(routeSchema, ROUTE_CONTEXT, probe.input);
      return scoreRoute(probe, result as Parameters<typeof scoreRoute>[1]);
    } catch (error) {
      return { input: probe.input, ok: false as const, error: String(error) };
    }
  });
}

/** Scores the cards set; a request that keeps failing counts as wrong. */
function cardsSet(): Promise<(CardsOutcome | Failed)[]> {
  const schema = createSelectionSchema(cardGroups, { max: CARDS_SELECT_MAX });
  return pool(CARDS_PROBES, async (probe) => {
    try {
      const result = await decide(schema, CARDS_CONTEXT, probe.input);
      return scoreCards(probe, result as Parameters<typeof scoreCards>[1]);
    } catch (error) {
      return { input: probe.input, ok: false as const, error: String(error) };
    }
  });
}

/** One line per outcome, marking the wrong ones. */
function report(outcomes: readonly Outcome[]): void {
  for (const outcome of outcomes) {
    const mark = outcome.ok ? ' ' : 'X';
    const what =
      'error' in outcome
        ? `error ${outcome.error}`
        : 'got' in outcome
          ? `${outcome.expected} -> ${outcome.got} (${outcome.detail})`
          : `${outcome.expected} -> ${
              outcome.sent === 'all' ? 'all cards' : outcome.sent.join(', ')
            }`;
    console.log(`  ${mark} ${what}  ${outcome.input}`);
  }
}

/** Runs the sets, prints accuracy per set and sets the exit code. */
async function main(): Promise<void> {
  if (!apiKey) {
    console.error('decide-eval needs TYPESAFE_API_KEY.');
    process.exitCode = 1;
    return;
  }
  const runRoute = values.only === '' || values.only === 'route';
  const runCards = values.only === '' || values.only === 'cards';
  const sets = [
    ...(runRoute
      ? [
          {
            name: 'route',
            min: DECIDE_EVAL_THRESHOLDS.route,
            outcomes: await routeSet(ROUTE_PROBES),
          },
          {
            name: 'route (held out)',
            min: DECIDE_EVAL_THRESHOLDS.heldOut,
            outcomes: await routeSet(HELD_OUT_ROUTE_PROBES),
          },
        ]
      : []),
    ...(runCards
      ? [
          {
            name: 'cards',
            min: DECIDE_EVAL_THRESHOLDS.cards,
            outcomes: await cardsSet(),
          },
        ]
      : []),
  ];

  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify(sets, null, 2));

  let failed = false;
  for (const set of sets) {
    const correct = correctCount(set.outcomes);
    const pass = correct >= set.min;
    failed ||= !pass;
    console.log(
      `${set.name}: ${correct}/${set.outcomes.length} (needs ${set.min}) ${pass ? 'pass' : 'FAIL'}`,
    );
    report(set.outcomes);
  }
  console.log(`All outcomes in ${values.out}`);
  process.exitCode = failed ? 1 : 0;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
