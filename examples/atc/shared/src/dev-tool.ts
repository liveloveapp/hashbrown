import { quotedSend, routeLine, type RouteSend } from './route-log';
import { routerDecisionInput, type RouterInputState } from './router-input';
import {
  alignTurns,
  cardsBlock,
  type DevStorage,
  filterBlocks,
  filterPanelVisible,
  jsonBlock,
  routerBlock,
  type RouterShown,
  routerShown,
  type StreamBlock,
  type StreamToolCall,
  toolBlocks,
  type TurnShown,
} from './stream-view';

/** The localStorage key that remembers whether dev mode is on. */
export const DEV_MODE_KEY = 'atc.devMode';

/** The localStorage key that remembers the drawer's height in pixels. */
export const DRAWER_HEIGHT_KEY = 'atc.drawerHeight';

/** The share of the column the drawer takes before it has been resized. */
const DEFAULT_SHARE = 0.35;

/** The most of the column the drawer may take. */
const MAX_SHARE = 0.6;

/** The least the drawer may take, in pixels (or the column, if shorter). */
const MIN_HEIGHT = 160;

/** Whether dev mode is on. It is off for a first visit and when storage throws. */
export function readDevMode(storage: DevStorage | null | undefined): boolean {
  try {
    return storage?.getItem(DEV_MODE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Remembers dev mode; a storage that throws is ignored. */
export function writeDevMode(
  storage: DevStorage | null | undefined,
  on: boolean,
): void {
  try {
    storage?.setItem(DEV_MODE_KEY, on ? 'on' : 'off');
  } catch {
    // Dev mode still works for this visit.
  }
}

/** The remembered drawer height in pixels, or null if none or unusable. */
export function readDrawerHeight(
  storage: DevStorage | null | undefined,
): number | null {
  try {
    const raw = storage?.getItem(DRAWER_HEIGHT_KEY);
    if (raw === null || raw === undefined || raw === '') return null;
    const px = Number(raw);

    return Number.isFinite(px) ? px : null;
  } catch {
    return null;
  }
}

/** Remembers the drawer height; a storage that throws is ignored. */
export function writeDrawerHeight(
  storage: DevStorage | null | undefined,
  px: number,
): void {
  try {
    storage?.setItem(DRAWER_HEIGHT_KEY, String(Math.round(px)));
  } catch {
    // The height still holds for this visit.
  }
}

/**
 * The drawer height to use in a column `columnPx` tall. With no remembered
 * height (null) it is 35% of the column; otherwise the height is kept between
 * 160 px (or the whole column, if shorter) and 60% of the column; the
 * 60% cap wins in a short column.
 */
export function clampDrawerHeight(px: number | null, columnPx: number): number {
  const wanted = px ?? Math.round(DEFAULT_SHARE * columnPx);
  const min = Math.min(MIN_HEIGHT, columnPx);
  const max = Math.round(MAX_SHARE * columnPx);

  return Math.min(max, Math.max(min, wanted));
}

/** A tab of the developer drawer. */
export type DevTabId = 'router' | 'cards' | 'filter' | 'ui' | 'tools';

/** The drawer's tabs, in order, with their labels. */
export const DEV_TABS: readonly { id: DevTabId; label: string }[] = [
  { id: 'router', label: 'Router' },
  { id: 'cards', label: 'Cards' },
  { id: 'filter', label: 'Filter' },
  { id: 'ui', label: 'UI stream' },
  { id: 'tools', label: 'Tools' },
];

/** Which send the drawer shows: the newest (`follow`) or a chosen one. */
export interface DevSelection {
  /** True while the drawer shows the newest send. */
  readonly follow: boolean;
  /** The chosen send, or null while following. */
  readonly index: number | null;
}

/**
 * Selects an earlier send; it stays selected as newer sends arrive. `index`
 * is an index into the recorded turns (append-only, superseded sends kept),
 * not a transcript row: map a clicked row with {@link rowTurns}.
 */
export function selectSend(index: number): DevSelection {
  return { follow: false, index };
}

/** Follows the newest send. */
export function followLatest(): DevSelection {
  return { follow: true, index: null };
}

/**
 * The index of the send to show, or null when there is none (no sends, or the
 * chosen one is gone). Following means the newest; a chosen send is kept
 * however many newer ones follow.
 */
export function selectedTurn(
  turns: readonly TurnShown[],
  selection: DevSelection,
): number | null {
  if (turns.length === 0) return null;
  if (selection.follow) return turns.length - 1;
  const index = selection.index;

  return index !== null && index >= 0 && index < turns.length ? index : null;
}

/** The composer is empty, so there is nothing for the router to decide. */
export const TYPING_EMPTY = { kind: 'empty' } as const;

/**
 * What the router makes of the text being typed: {@link TYPING_EMPTY} for an
 * empty composer, null while no answer for the text is in yet, else what a
 * send now would record.
 */
export type TypingShown = RouterShown | typeof TYPING_EMPTY | null;

/**
 * What the router makes of the text being typed, for the drawer:
 * {@link TYPING_EMPTY} while the composer is empty, null while no answer for
 * this text is in yet, else what a send now would record (`ms` is how long
 * the answer took).
 */
export function routerTyping(
  state: RouterInputState,
  ms: number | null,
): TypingShown {
  if (state.text === '') return TYPING_EMPTY;
  if (state.pending && routerDecisionInput(state.text) !== null) return null;

  return routerShown(state, ms);
}

/**
 * The send to show: the selected one, or the newest when following or when
 * the chosen send is gone (the thread was reset). Null with no sends.
 */
export function shownTurn(
  turns: readonly TurnShown[],
  selection: DevSelection,
): number | null {
  return selectedTurn(turns, selection) ?? selectedTurn(turns, followLatest());
}

/** The parts of a transcript row that the drawer reads. */
export type DevRow =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'tools'; readonly calls: readonly StreamToolCall[] }
  | { readonly kind: 'reasoning' }
  | {
      readonly kind: 'answer';
      readonly message: { readonly content?: unknown };
    };

/**
 * For each transcript row, the index in `turns` of the send it belongs to,
 * or null (before the first user row, or a user row with no recorded send).
 * User rows are matched to sends the way the transcript does (`alignTurns`),
 * so superseded sends are skipped.
 */
export function rowTurns(
  rows: readonly DevRow[],
  turns: readonly TurnShown[],
): (number | null)[] {
  const userTexts = rows.flatMap((row) =>
    row.kind === 'user' ? [row.text] : [],
  );
  const owners = alignTurns(turns, userTexts).map((turn) =>
    turn === undefined ? null : turns.indexOf(turn),
  );
  let user = -1;

  return rows.map((row) => {
    if (row.kind === 'user') user += 1;

    return user < 0 ? null : (owners[user] ?? null);
  });
}

/**
 * The answer and tool calls of send `turn` (an index into `turns`): its last
 * answer, streaming while `busy` and the send is the newest in the
 * transcript, and every tool call it made. A send with no rows has neither.
 */
export function sendActivity(
  rows: readonly DevRow[],
  turns: readonly TurnShown[],
  turn: number | null,
  busy: boolean,
): Pick<DevToolInput, 'answer' | 'tools'> {
  const owners = rowTurns(rows, turns);
  const mine = rows.filter(
    (_, index) => turn !== null && owners[index] === turn,
  );
  if (mine.length === 0) return { answer: null, tools: [] };
  const last = mine.findLast((row) => row.kind === 'answer');

  return {
    answer: {
      content: last?.kind === 'answer' ? last.message.content : undefined,
      streaming: busy && owners.at(-1) === turn,
    },
    tools: mine.flatMap((row) => (row.kind === 'tools' ? row.calls : [])),
  };
}

/** Everything the drawer's tabs read. */
export interface DevToolInput {
  /** What the router makes of the text being typed. */
  typing: TypingShown;
  /** The shown send, if any. */
  turn: TurnShown | undefined;
  /** True while the drawer follows the newest send (no answer picked). */
  following: boolean;
  /** Every submission and its route, newest first (`recordRoute`). */
  routes: readonly RouteSend[];
  /** The shown send's answer, as it streams. */
  answer: { content: unknown; streaming: boolean } | null;
  /** The shown send's tool calls. */
  tools: readonly StreamToolCall[];
  /** The filter step: see {@link devFilter}. */
  filter: DevFilter;
}

/** The Filter tab: the latest filter run while it still counts, and the map's filter. */
export interface DevFilter {
  /** The run, while it streams or the map still holds what it produced; else null. */
  readonly run: {
    readonly router: RouterShown | null;
    readonly output: unknown;
    readonly streaming: boolean;
  } | null;
  /** The filter on the map, whoever applied it, or null. */
  readonly applied: unknown;
}

/** The note on a map filter that no filter run produced. */
const APPLIED_ELSEWHERE =
  'applied by the assistant or the pill (no filter run)';

/**
 * The Filter tab's input. The run shows only while `filterPanelVisible`
 * holds: while it streams (`loading`), or while the map's filter (`current`)
 * is still the one the run produced (`produced`, recorded when the run
 * settles). The assistant's filter tool, a clear or the pill's x replace it,
 * and only the applied filter shows.
 */
export function devFilter(options: {
  readonly route: RouterShown | null;
  readonly loading: boolean;
  readonly current: { readonly filter: unknown } | null;
  readonly produced: { readonly filter: unknown } | null;
  readonly output: unknown;
}): DevFilter {
  const visible = filterPanelVisible(options);

  return {
    run: visible
      ? {
          router: options.route,
          output: options.output,
          streaming: options.loading,
        }
      : null,
    applied: options.current?.filter ?? null,
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `value` is Hashbrown's parsed node: `{ complete, partialValue, value? }`. */
function isNodeWrapper(value: unknown): value is { partialValue: unknown } {
  return (
    isRecordValue(value) &&
    typeof value['complete'] === 'boolean' &&
    'partialValue' in value &&
    Object.keys(value).every((key) =>
      ['complete', 'partialValue', 'value'].includes(key),
    )
  );
}

/**
 * The UI JSON as the model wrote it. Hashbrown's parsed answer wraps each
 * component's props as `{ complete, partialValue, value }`; this replaces
 * every such wrapper with its `partialValue` (what has streamed so far),
 * through children too, and leaves everything else as it is.
 */
export function wireUi(content: unknown): unknown {
  if (isNodeWrapper(content)) return wireUi(content.partialValue);
  if (Array.isArray(content)) return content.map(wireUi);
  if (isRecordValue(content)) {
    return Object.fromEntries(
      Object.entries(content).map(([key, value]) => [key, wireUi(value)]),
    );
  }

  return content;
}

/** How many earlier sends the Router tab lists under the newest. */
const EARLIER_SENDS = 4;

/** The Router tab's live block for the text being typed. */
function typingBlock(typing: TypingShown): StreamBlock {
  return typing?.kind === 'empty'
    ? { title: 'typing', text: 'type to see where it goes' }
    : { ...routerBlock(typing), title: 'typing' };
}

/**
 * The Router tab's sent blocks. With an answer picked in the chat (or no
 * submission logged yet), that chat send's router; otherwise the newest
 * submission of any route (chat, filter, clear, starter, refinement) in
 * full, then up to four earlier ones, one line each.
 */
function sentBlocks(input: DevToolInput): StreamBlock[] {
  // Before any submission is logged, the shown chat send stands in.
  if (
    input.turn !== undefined &&
    (!input.following || input.routes.length === 0)
  ) {
    return [
      {
        title: `sent: ${quotedSend(input.turn.text)} → chat`,
        text: routerBlock(input.turn.router).text,
      },
    ];
  }
  const [newest, ...earlier] = input.routes;
  if (newest === undefined) {
    return [{ title: 'sent', text: 'nothing sent yet' }];
  }
  const lines = earlier.slice(0, EARLIER_SENDS).map(routeLine);

  return [
    {
      title: `sent: ${quotedSend(newest.text)} → ${newest.outcome}`,
      text: routerBlock(newest.router).text,
    },
    ...(lines.length === 0
      ? []
      : [{ title: 'earlier', text: lines.join('\n') }]),
  ];
}

/**
 * The blocks one tab lists, in order. A tab with nothing to show says so with
 * one block rather than rendering nothing.
 */
export function devTabBlocks(
  tab: DevTabId,
  input: DevToolInput,
): StreamBlock[] {
  switch (tab) {
    case 'router':
      return [typingBlock(input.typing), ...sentBlocks(input)];
    case 'cards': {
      // A settled send whose decision never reported (none was asked) reads
      // as the fallback instead of "deciding…" forever.
      const settled =
        input.turn !== undefined &&
        input.answer !== null &&
        input.answer.content !== undefined &&
        input.answer.content !== null &&
        !input.answer.streaming;

      return [
        cardsBlock(
          input.turn?.cards ??
            (settled
              ? { result: null, ms: null, error: 'not asked' }
              : undefined),
        ),
      ];
    }
    case 'filter': {
      const { run, applied } = input.filter;
      const json = jsonBlock('applied', applied, false);
      const appliedBlock: StreamBlock =
        applied === null || applied === undefined
          ? { title: 'applied', text: 'no filter' }
          : run === null
            ? { title: 'applied', text: `${APPLIED_ELSEWHERE}\n${json.text}` }
            : json;

      return [
        ...(run === null
          ? []
          : filterBlocks(run.router, run.output, run.streaming)),
        appliedBlock,
      ];
    }
    case 'ui':
      return [
        jsonBlock(
          'ui',
          wireUi(input.answer?.content),
          input.answer?.streaming ?? false,
        ),
      ];
    case 'tools':
      return input.tools.length === 0
        ? [{ title: 'tools', text: 'no tool calls' }]
        : toolBlocks(input.tools);
  }
}
