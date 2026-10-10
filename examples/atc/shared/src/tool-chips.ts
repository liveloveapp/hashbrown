import { AIRPORTS } from './places';
import { type AtcState, normalizeHex } from './store';
import type { AtcToolName } from './tools';

/** The parts of a Hashbrown tool call that the tool chips read. */
export interface ToolCallLike {
  /** Hashbrown's id for the call, stable while it streams and runs. */
  readonly toolCallId?: string;
  readonly name: string;
  readonly args: unknown;
  readonly status: 'pending' | 'done';
  readonly result?: { readonly status: 'fulfilled' | 'rejected' };
}

/** What a tool chip shows. Only `running` animates. */
export interface ToolChipView {
  readonly label: string;
  readonly state: 'running' | 'done' | 'failed' | 'stopped';
}

/**
 * One step in a turn's list of tool calls: its chip plus a `key` that stays
 * the same while the call streams, runs and finishes (the tool call id, or
 * its position when there is none), for keyed lists.
 */
export interface ToolStepView extends ToolChipView {
  readonly key: string;
}

/** Names an aircraft by hex for a chip, or null when it is not known. */
export type HexLabel = (hex: string) => string | null;

/** A {@link HexLabel} that names live aircraft by their display label. */
export function labelForHex(state: AtcState): HexLabel {
  return (hex) => state.aircraft.get(normalizeHex(hex))?.label ?? null;
}

const MAX_ARG = 24;

function record(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null
    ? (args as Record<string, unknown>)
    : {};
}

function shortText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return null;

  return text.length > MAX_ARG ? `${text.slice(0, MAX_ARG - 1)}…` : text;
}

function code(value: unknown): string | null {
  return shortText(value)?.toUpperCase() ?? null;
}

/** An airport by its city ("KSEA" is "Seattle"), else its code. */
function place(value: unknown): string | null {
  const id = code(value);
  if (id === null) return null;

  return Object.hasOwn(AIRPORTS, id)
    ? AIRPORTS[id as keyof typeof AIRPORTS].city
    : id;
}

/** How a kind reads before "aircraft". */
const KIND_WORDS: Record<string, string> = {
  single: 'single-engine',
  twin: 'twin-engine',
  jet: 'jet',
  rotor: 'helicopter',
};

function feet(value: unknown, prefix: string): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${prefix} ${Math.round(value).toLocaleString('en-US')} ft`
    : null;
}

/** "25 nm" for a finite number, else null. */
function miles(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)} nm`
    : null;
}

/** "within 25 nm of Bend", or "near Bend" while the radius streams. */
function nearSummary(value: unknown): string | null {
  const near = record(value);
  const airport = place(near['airport']);
  const radius = miles(near['radiusNm']);
  if (airport === null) return null;

  return radius === null ? `near ${airport}` : `within ${radius} of ${airport}`;
}

/**
 * What findAircraft is looking for, in plain words: "UAL 737 aircraft above
 * 10,000 ft", "aircraft approaching Seattle", "aircraft sorted by altitude".
 */
function findSummary(args: Record<string, unknown>): string {
  const kind = shortText(args['kind']);
  const approaching = place(args['approaching']);
  const before = [
    shortText(args['airline']),
    shortText(args['typeCode']),
    kind === null ? null : (KIND_WORDS[kind] ?? kind),
  ].filter((part): part is string => part !== null);
  const after = [
    feet(args['minAltitudeFt'], 'above'),
    feet(args['maxAltitudeFt'], 'below'),
    approaching === null ? null : `approaching ${approaching}`,
    nearSummary(args['near']),
  ].filter((part): part is string => part !== null);
  const sortBy = shortText(args['sortBy']);
  const filtered = before.length > 0 || after.length > 0;
  const tail =
    after.length > 0
      ? ` ${after.join(', ')}`
      : !filtered && sortBy !== null
        ? ` sorted by ${sortBy}`
        : '';

  return `${[...before, 'aircraft'].join(' ')}${tail}`;
}

function hexCount(args: Record<string, unknown>): number | null {
  return Array.isArray(args['hexes']) ? args['hexes'].length : null;
}

function planeName(
  args: Record<string, unknown>,
  labelFor: HexLabel,
): string | null {
  const hex = shortText(args['hex']);

  return hex === null
    ? null
    : (labelFor(normalizeHex(hex)) ?? hex.toUpperCase());
}

/**
 * What a running call is doing, in sentence case. Keyed by every tool name,
 * so a new tool does not compile until it has a label here and in DONE.
 */
const RUNNING: Record<
  AtcToolName,
  (args: Record<string, unknown>, labelFor: HexLabel) => string
> = {
  findAircraft: (args) => `Finding ${findSummary(args)}`,
  lookupRoute: (args) => {
    const callsign = code(args['callsign']);

    return callsign === null
      ? 'Looking up a route'
      : `Looking up the route of ${callsign}`;
  },
  highlightAircraft: (args) => {
    const count = hexCount(args);

    return count === null
      ? 'Highlighting aircraft'
      : `Highlighting ${count} aircraft`;
  },
  clearHighlight: () => 'Clearing the highlight',
  followAircraft: (args, labelFor) => {
    const name = planeName(args, labelFor);

    return name === null ? 'Following a plane' : `Following ${name}`;
  },
  stopFollowing: () => 'Stopping the follow',
  getSelectedAircraft: () => 'Checking the selected plane',
  lookupPlace: (args) => {
    const query = shortText(args['query']);

    return query === null ? 'Looking up a place' : `Looking up ${query}`;
  },
  showArea: (args) => {
    const airport = place(args['airport']);
    const radius = miles(args['radiusNm']);
    if (airport === null) return 'Showing an area';

    return radius === null
      ? `Showing ${airport}`
      : `Showing ${radius} around ${airport}`;
  },
  resetMap: () => 'Returning to central Oregon',
};

const noLabels: HexLabel = () => null;

/** The entry for a tool the model named, or undefined for an unknown name. */
function entryFor<T>(
  table: Record<AtcToolName, T>,
  name: string,
): T | undefined {
  return Object.hasOwn(table, name) ? table[name as AtcToolName] : undefined;
}

/**
 * What a tool call is doing, such as "Finding aircraft approaching Seattle"
 * or "Following UAL1802" (planes named by `labelFor`, else their hex).
 * Arguments may be partial while they stream, so anything unexpected falls
 * back to a plain phrase, and an unknown tool to its name.
 */
export function toolCallLabel(
  name: string,
  args: unknown,
  labelFor: HexLabel = noLabels,
): string {
  return entryFor(RUNNING, name)?.(record(args), labelFor) ?? name;
}

/**
 * The chip for one tool call. A pending call only spins while the chat is
 * busy, so a run that errors or stops never leaves a chip spinning.
 */
export function toolChipView(
  call: ToolCallLike,
  busy: boolean,
  labelFor: HexLabel = noLabels,
): ToolChipView {
  const label = toolCallLabel(call.name, call.args, labelFor);
  if (call.status === 'pending') {
    return { label, state: busy ? 'running' : 'stopped' };
  }

  return {
    label,
    state: call.result?.status === 'rejected' ? 'failed' : 'done',
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What finished calls of one tool did, in the past tense. */
const DONE: Record<
  AtcToolName,
  (calls: readonly Record<string, unknown>[], labelFor: HexLabel) => string
> = {
  findAircraft: (calls) =>
    calls.length === 1
      ? 'searched traffic'
      : `searched traffic ${calls.length} times`,
  lookupRoute: (calls) =>
    `looked up ${plural(calls.length, 'route', 'routes')}`,
  highlightAircraft: (calls) => {
    const count = hexCount(calls.at(-1) ?? {});

    return count === null
      ? 'highlighted aircraft'
      : `highlighted ${count} aircraft`;
  },
  clearHighlight: () => 'cleared the highlight',
  followAircraft: (calls, labelFor) => {
    const name = planeName(calls.at(-1) ?? {}, labelFor);

    return name === null ? 'followed a plane' : `followed ${name}`;
  },
  stopFollowing: () => 'stopped following',
  getSelectedAircraft: () => 'checked the selected plane',
  lookupPlace: (calls) => {
    const query = calls.length === 1 ? shortText(calls[0]?.['query']) : null;

    return query === null
      ? `looked up ${plural(calls.length, 'place', 'places')}`
      : `looked up ${query}`;
  },
  showArea: (calls) => {
    const airport = place(calls.at(-1)?.['airport']);

    return airport === null ? 'showed an area' : `showed ${airport}`;
  },
  resetMap: () => 'returned to central Oregon',
};

/** One assistant turn's tool calls: a summary of the finished ones, and the live ones. */
export interface ToolRunView {
  /** What the finished calls did, such as "Searched traffic, looked up 6 routes", or null. */
  readonly summary: string | null;
  /** The calls still running, shown live with a spinner. */
  readonly live: readonly ToolStepView[];
  /** Every call, in order, for the expanded list. */
  readonly chips: readonly ToolStepView[];
  /** The step running now, such as "Finding aircraft approaching Seattle…", or null. */
  readonly current: string | null;
  /** How many steps the turn took: "1 step", "4 steps". */
  readonly steps: string;
}

/**
 * Folds a turn's tool calls into one summary line of what the finished calls
 * did (grouped by tool, in the order first used, with failed and stopped
 * calls counted at the end) and the running calls, which stay live.
 */
export function toolRunView(
  calls: readonly ToolCallLike[],
  busy: boolean,
  labelFor: HexLabel = noLabels,
): ToolRunView {
  const chips = calls.map((call, index): ToolStepView => ({
    key: call.toolCallId ?? `step-${index}`,
    ...toolChipView(call, busy, labelFor),
  }));
  const groups = new Map<string, Record<string, unknown>[]>();
  calls.forEach((call, index) => {
    if (chips[index]?.state === 'done') {
      groups.set(call.name, [
        ...(groups.get(call.name) ?? []),
        record(call.args),
      ]);
    }
  });
  const count = (state: ToolChipView['state']) =>
    chips.filter((chip) => chip.state === state).length;
  const failed = count('failed');
  const stopped = count('stopped');
  const parts = [
    ...[...groups].map(
      ([name, args]) => entryFor(DONE, name)?.(args, labelFor) ?? name,
    ),
    ...(failed > 0 ? [`${failed} failed`] : []),
    ...(stopped > 0 ? [`${stopped} stopped`] : []),
  ];
  const text = parts.join(', ');
  const running = chips.findLast((chip) => chip.state === 'running');

  return {
    summary:
      text === '' ? null : `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
    live: chips.filter((chip) => chip.state === 'running'),
    chips,
    current: running === undefined ? null : `${running.label}…`,
    steps: plural(chips.length, 'step', 'steps'),
  };
}
