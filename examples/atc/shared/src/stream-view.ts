import type { Decision } from '@hashbrownai/core';
import { routeAction } from './route';
import type { RouterInputState } from './router-input';

/** The most cards a turn is narrowed to; the apps pass it to the decision. */
export const CARDS_SELECT_MAX = 2;

/** The confidence a cards decision needs; below it the chat gets every card. */
export const CARDS_MIN_CONFIDENCE = 0.7;

/** The probability at which a card counts as picked. */
const PICK_PROBABILITY = 0.5;

/** The caret drawn after the last token of a value that is still streaming. */
const CARET = '▍';

/** The localStorage key that remembers the "Show the stream" switch. */
export const SHOW_STREAM_KEY = 'atc.showStream';

/** A decision's answers and their metadata, as Hashbrown returns them. */
export interface DecisionResultLike {
  readonly value: unknown;
  readonly meta: unknown;
}

/** One answered question in a decision, for display. */
export interface DecisionRow {
  /** The question, such as `intent`, or the option, such as `FlightCard`. */
  readonly key: string;
  /** The answer: an enumeration member, `yes` or `no`, or the milliseconds. */
  readonly answer: string;
  /** The probability of that answer, or null where there is none (`ms`). */
  readonly probability: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rowFor(
  key: string,
  answer: unknown,
  meta: unknown,
): DecisionRow | null {
  const info = isRecord(meta) ? meta : {};
  if (typeof answer === 'string') {
    const probabilities = isRecord(info['probabilities'])
      ? info['probabilities']
      : {};

    return {
      key,
      answer,
      probability:
        numberOf(probabilities[answer]) ?? numberOf(info['confidence']),
    };
  }
  if (typeof answer === 'boolean') {
    const yes = numberOf(info['probability']);

    return {
      key,
      answer: answer ? 'yes' : 'no',
      probability: yes === null ? null : answer ? yes : 1 - yes,
    };
  }

  return null;
}

/**
 * The rows of a decision: one per answered question, in the order the value
 * has them, with the probability of the answer given. An enumeration reports
 * the probability of the member it chose (else its confidence); a yes/no
 * question reports the probability of the answer, so `no` at 0.12 yes shows
 * 0.88. A multi-select (one boolean per option) yields one row per option.
 * With `ms`, a final row `ms` reports how long the request took. A null
 * result yields only that row, or none.
 */
export function decisionView(
  result: DecisionResultLike | null,
  ms: number | null,
): DecisionRow[] {
  const value = result !== null && isRecord(result.value) ? result.value : {};
  const meta = result !== null && isRecord(result.meta) ? result.meta : {};
  const rows = Object.entries(value).flatMap(([key, answer]) => {
    const row = rowFor(key, answer, meta[key]);

    return row === null ? [] : [row];
  });

  return ms === null
    ? rows
    : [
        ...rows,
        { key: 'ms', answer: String(Math.round(ms)), probability: null },
      ];
}

/** A row as one line of text: `intent: filter 0.97`. */
function rowLine(row: DecisionRow): string {
  return row.probability === null
    ? `${row.key}: ${row.answer}`
    : `${row.key}: ${row.answer} ${row.probability.toFixed(2)}`;
}

/**
 * Pretty-prints a value as JSON for a stream panel: two-space indent, keys in
 * the order they arrived. While `streaming`, a caret follows the last token;
 * a value that has not started (undefined or null) is then just the caret.
 * The result is text for text nodes, never for innerHTML.
 */
export function streamJson(value: unknown, streaming = false): string {
  const text =
    value === undefined || (value === null && streaming)
      ? ''
      : (JSON.stringify(value, null, 2) ?? '');

  return streaming ? `${text}${CARET}` : text;
}

/** A titled block of a stream panel; `text` is rendered as plain text. */
export interface StreamBlock {
  readonly title: string;
  readonly text: string;
}

/** What the router did for one send. */
export type RouterShown =
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'fallback'; readonly reason: string }
  | {
      readonly kind: 'decided';
      readonly result: DecisionResultLike;
      readonly ms: number | null;
    };

/** What the router did for a starter: nothing, the starter names its route. */
export const ROUTER_SKIPPED: RouterShown = {
  kind: 'skipped',
  reason: 'starter',
};

/**
 * What the router decided for the text being sent, from its state at send
 * time and the milliseconds its last answer took. Anything but an answer for
 * this very text is shown as a fallback to chat, with the reason.
 */
export function routerShown(
  state: RouterInputState,
  ms: number | null,
): RouterShown {
  if (state.failed) {
    return { kind: 'fallback', reason: 'unavailable' };
  }
  if (state.result !== null && state.decidedFor === state.text) {
    return { kind: 'decided', result: state.result, ms };
  }

  return { kind: 'fallback', reason: 'no answer in time' };
}

/** The router's block: its answers with probabilities and milliseconds. */
export function routerBlock(shown: RouterShown | null): StreamBlock {
  const title = 'router';
  if (shown === null) return { title, text: 'waiting' };
  if (shown.kind === 'skipped') {
    return { title, text: `skipped (${shown.reason})` };
  }
  if (shown.kind === 'fallback') {
    return { title, text: `→ chat (${shown.reason})` };
  }
  const action = routeAction(shown.result as Parameters<typeof routeAction>[0]);
  const intent = (shown.result.value as { intent?: unknown } | null)?.intent;
  const head =
    action.kind === 'chat' && intent !== 'chat'
      ? '→ chat (unsure)'
      : `→ ${action.kind}`;

  return {
    title,
    text: [head, ...decisionView(shown.result, shown.ms).map(rowLine)].join(
      '\n',
    ),
  };
}

/** The cards decision of one turn: the raw result, or why there is none. */
export interface CardsShown {
  /** The decision, or null when the request failed. */
  readonly result: DecisionResultLike | null;
  /** How long the request took. */
  readonly ms: number | null;
  /** Why there is no result. */
  readonly error?: string;
}

/**
 * The cards the decision picked: probability at least 0.5, best first, at
 * most {@link CARDS_SELECT_MAX}; `confident` is false when none, or when the
 * best is below {@link CARDS_MIN_CONFIDENCE} (then the chat sends every
 * card). This mirrors core's `resolveSelection` for `{ max }`, which reads
 * each option's probability from the metadata whatever its boolean value
 * says, so a card at exactly 0.5 counts.
 */
export function cardPicks(result: DecisionResultLike): {
  readonly picks: readonly string[];
  readonly confident: boolean;
} {
  const meta = isRecord(result.meta) ? result.meta : {};
  const kept = Object.keys(meta)
    .map((id) => ({
      id,
      probability: numberOf(
        (meta[id] as { probability?: unknown })?.probability,
      ),
    }))
    .filter((entry) => (entry.probability ?? 0) >= PICK_PROBABILITY)
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
    .slice(0, CARDS_SELECT_MAX);

  return {
    picks: kept.map((entry) => entry.id),
    confident: (kept[0]?.probability ?? 0) >= CARDS_MIN_CONFIDENCE,
  };
}

/** The cards block: the picks, or the explicit fallback to every card. */
export function cardsBlock(shown: CardsShown | undefined): StreamBlock {
  const title = 'cards';
  if (shown === undefined) return { title, text: 'deciding…' };
  if (shown.result === null) {
    return {
      title,
      text: `all (fallback: ${shown.error ?? 'error'})`,
    };
  }
  const { picks, confident } = cardPicks(shown.result);
  const head =
    picks.length > 0 && confident
      ? `picks: ${picks.join(', ')}`
      : 'all (fallback: unsure)';
  const lines = decisionView(shown.result, shown.ms).map(rowLine);

  return { title, text: [head, ...lines].join('\n') };
}

/** A block that streams a JSON value, with a caret while `streaming`. */
export function jsonBlock(
  title: string,
  value: unknown,
  streaming: boolean,
): StreamBlock {
  return { title, text: streamJson(value, streaming) };
}

/** What a send recorded for its answer's panel. */
export interface TurnShown {
  /** The text that was sent, to find the send's user row. */
  readonly text: string;
  readonly router: RouterShown;
  /** Undefined until the cards decision settles. */
  readonly cards?: CardsShown;
}

/**
 * For each transcript row, the index of the send whose panel it carries, or
 * null. Sends are numbered by the user rows; the panel sits on the last
 * answer row of each send, so a send with tool steps shows it once, on the
 * final answer.
 */
export function answerTurns(
  kinds: readonly { readonly kind: string }[],
): (number | null)[] {
  const turns = kinds.map(() => null as number | null);
  let turn = -1;
  let last = -1;
  kinds.forEach((item, index) => {
    if (item.kind === 'user') {
      turn += 1;
      last = -1;
    } else if (item.kind === 'answer' && turn >= 0) {
      if (last >= 0) turns[last] = null;
      turns[index] = turn;
      last = index;
    }
  });

  return turns;
}

/** Appends the send that just started (its cards decision is pending). */
export function addTurn(
  turns: readonly TurnShown[],
  router: RouterShown,
  text: string,
): TurnShown[] {
  return [...turns, { text, router }];
}

/**
 * Finds the send behind each user row, by the text sent. A send that was
 * superseded while its cards decision was pending, or that the chat refused,
 * has no user row; scanning from the newest, each row takes the latest unused
 * send with its text, so duplicates resolve to the one that really ran and
 * orphans are dropped. A row with no send (undefined) gets no panel.
 */
export function alignTurns(
  turns: readonly TurnShown[],
  userTexts: readonly string[],
): (TurnShown | undefined)[] {
  const used = new Set<number>();

  return userTexts
    .map((text, row) => ({ text, row }))
    .reverse()
    .map(({ text, row }) => {
      const at = turns.findLastIndex(
        (turn, index) => !used.has(index) && turn.text === text,
      );
      if (at >= 0) used.add(at);

      return { row, turn: at >= 0 ? turns[at] : undefined };
    })
    .sort((a, b) => a.row - b.row)
    .map(({ turn }) => turn);
}

/**
 * Prefers what the decision hook decoded: replaces the newest send's result
 * with the hook's `value` and `meta`, or, given an error (a failed or
 * stopped decision), empties the cards with the error's message. Does
 * nothing until the transport has reported the send.
 */
export function withDecoded(
  turns: readonly TurnShown[],
  decoded: DecisionResultLike | Error,
): TurnShown[] {
  const last = turns.at(-1);
  if (last?.cards === undefined) return [...turns];
  const cards: CardsShown =
    decoded instanceof Error
      ? { result: null, ms: last.cards.ms, error: decoded.message }
      : {
          result: { value: decoded.value, meta: decoded.meta },
          ms: last.cards.ms,
        };

  return [...turns.slice(0, -1), { ...last, cards }];
}

/**
 * Records a settled cards decision on the newest send, which it belongs to
 * (a newer send aborts an older decision, and aborted requests never settle).
 */
export function settleCards(
  turns: readonly TurnShown[],
  settled: SettledDecision,
): TurnShown[] {
  const last = turns.at(-1);
  if (last === undefined) return [...turns];
  const cards: CardsShown =
    settled.response === null
      ? { result: null, ms: settled.ms, error: settled.error ?? 'error' }
      : {
          result: {
            value: settled.response.value,
            meta: settled.response.meta,
          },
          ms: settled.ms,
        };

  return [...turns.slice(0, -1), { ...last, cards }];
}

/**
 * The panel blocks under one assistant answer. While the answer is not
 * `streaming`, a send whose cards decision never ran says so, instead of
 * waiting for it.
 */
export function answerBlocks(
  turn: TurnShown | undefined,
  content: unknown,
  streaming: boolean,
): StreamBlock[] {
  return [
    routerBlock(turn?.router ?? null),
    cardsBlock(
      turn?.cards ??
        (streaming
          ? undefined
          : { result: null, ms: null, error: 'not asked' }),
    ),
    jsonBlock('ui', content, streaming),
  ];
}

/**
 * Whether the panel under the filter pill shows: only with a router decision
 * for a run, and then only while that run streams (`loading`), or while the
 * map's filter (`current`) is still the object the run produced. The
 * assistant's filter tool, a clear and the pill's x all replace it, so the
 * panel never describes a filter that is no longer on the map.
 */
export function filterPanelVisible(options: {
  readonly route: RouterShown | null;
  readonly loading: boolean;
  readonly current: unknown;
  readonly produced: unknown;
}): boolean {
  return (
    options.route !== null &&
    (options.loading ||
      (options.current !== null && options.current === options.produced))
  );
}

/** The panel blocks under the filter pill: the router, then the filter. */
export function filterBlocks(
  router: RouterShown | null,
  output: unknown,
  streaming: boolean,
): StreamBlock[] {
  return [routerBlock(router), jsonBlock('filter', output, streaming)];
}

/** The parts of a tool call that the stream panel shows. */
export interface StreamToolCall {
  readonly name: string;
  readonly args: unknown;
  readonly status: 'pending' | 'done';
}

/** One block per tool call: its name and its arguments as JSON. */
export function toolBlocks(calls: readonly StreamToolCall[]): StreamBlock[] {
  return calls.map((call) =>
    jsonBlock(call.name, call.args, call.status === 'pending'),
  );
}

/** The storage the switch is remembered in (`localStorage`). */
export type ShowStreamStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether "Show the stream" is on. It is on for a first visit, and whenever
 * storage is missing or throws (private windows, blocked site data).
 */
export function readShowStream(
  storage: ShowStreamStorage | null | undefined,
): boolean {
  try {
    return storage?.getItem(SHOW_STREAM_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Remembers the switch; a storage that throws is ignored. */
export function writeShowStream(
  storage: ShowStreamStorage | null | undefined,
  on: boolean,
): void {
  try {
    storage?.setItem(SHOW_STREAM_KEY, on ? 'on' : 'off');
  } catch {
    // The switch still works for this visit.
  }
}

/** `localStorage`, or null where reading the property itself throws. */
export function browserStorage(): ShowStreamStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A cards decision that settled, as a transport saw it. */
export interface SettledDecision {
  readonly response: Decision.Response | null;
  readonly error: string | null;
  readonly ms: number;
}

/**
 * Wraps a decision transport and reports each request that settles (answer or
 * failure, with the milliseconds it took). A request the browser aborted is
 * not reported. The wrapper returns or throws exactly what the transport did.
 */
export function observeDecisions(
  transport: Decision.Transport,
  onSettled: (settled: SettledDecision) => void,
): Decision.Transport {
  return async (request, signal) => {
    const started = Date.now();
    try {
      const response = await transport(request, signal);
      if (!signal.aborted) {
        onSettled({ response, error: null, ms: Date.now() - started });
      }

      return response;
    } catch (error) {
      if (!signal.aborted) {
        onSettled({
          response: null,
          error: error instanceof Error ? error.message : 'error',
          ms: Date.now() - started,
        });
      }
      throw error;
    }
  };
}
