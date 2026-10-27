import type { Turn } from './group-turns';
import {
  getServerToolCallLabel,
  type ServerToolCallLabelOverrides,
} from './server-tool-call-display';
import { collectTurnSources } from './turn-annotations';
import { formatDuration } from './tool-step-timing';
import type { AnyMessage } from './view.models';

/** A headless summary of one conversational turn. @public */
export interface TurnSummary {
  /** The current turn lifecycle state. */
  readonly status: 'working' | 'awaiting' | 'complete' | 'failed' | 'cancelled';
  /** Human-readable lifecycle wording. */
  readonly text: string;
  /** Compact counts and, for active turns, known elapsed time. */
  readonly meta: string;
  /** Whether the summary represents work currently in progress. */
  readonly live: boolean;
  /** Total client and server tool calls. */
  readonly toolCallCount: number;
  /** Sources deduplicated by ID. */
  readonly sourceCount: number;
  /** Failed client and server tool calls. */
  readonly failedToolCallCount: number;
  /** Server tool calls explicitly denied. */
  readonly deniedToolCallCount: number;
  /** Server tool calls explicitly cancelled. */
  readonly cancelledToolCallCount: number;
  /** Known elapsed time derived only from caller-provided turn timestamps. */
  readonly durationMs?: number;
}

/** Caller-owned lifecycle, wording, and clock values for a turn. @public */
export interface TurnSummaryOptions {
  /** Overrides inferred lifecycle state, including run errors. */
  readonly status?: TurnSummary['status'];
  /** Application wording keyed by technical tool name. */
  readonly labels?: ServerToolCallLabelOverrides;
  /** Turn start timestamp in milliseconds. */
  readonly startedAt?: number;
  /** Turn settlement timestamp from the same clock. */
  readonly settledAt?: number;
  /** Current timestamp, used only for working and awaiting turns. */
  readonly now?: number;
}

/**
 * Summarizes a turn without reading a clock or changing its inputs.
 * Metadata always includes the tool-call count, including zero; other zero
 * counts are omitted. Activities never count as tool calls. Individual tool
 * failures do not imply a failed run. Turn duration uses only the supplied
 * turn timestamps, never the timestamps of individual tools.
 *
 * @param turn - The conversational turn to summarize.
 * @param options - Explicit lifecycle, label overrides, and turn timestamps.
 * @returns Plain summary state suitable for any framework.
 * @public
 */
export function summarizeTurn<M extends AnyMessage>(
  turn: Turn<M>,
  options?: TurnSummaryOptions,
): TurnSummary {
  const serverCalls = turn.assistants.flatMap(
    (assistant) => assistant.serverToolCalls ?? [],
  );
  const clientCalls = turn.assistants.flatMap(
    (assistant) => assistant.toolCalls ?? [],
  );
  const openServerCalls = serverCalls.filter(
    (call) => call.status !== 'complete',
  );
  const status =
    options?.status ??
    (turn.errors.length > 0
      ? 'failed'
      : openServerCalls.length > 0 ||
          clientCalls.some((call) => call.status === 'pending')
        ? 'working'
        : 'complete');
  const active = status === 'working' || status === 'awaiting';
  const end = options?.settledAt ?? (active ? options?.now : undefined);
  const start = options?.startedAt;
  const elapsed =
    start !== undefined &&
    end !== undefined &&
    Number.isFinite(start) &&
    Number.isFinite(end)
      ? end - start
      : undefined;
  const duration = formatDuration(elapsed);
  const durationMs = duration === undefined ? undefined : elapsed;
  const newest = openServerCalls.reduce<
    (typeof openServerCalls)[number] | undefined
  >((previous, call) => {
    const previousStart = previous?.timing?.startedAt;
    const callStart = call.timing?.startedAt;
    return previous !== undefined &&
      previousStart !== undefined &&
      callStart !== undefined &&
      Number.isFinite(previousStart) &&
      Number.isFinite(callStart) &&
      previousStart > callStart
      ? previous
      : call;
  }, undefined);
  const outcomes = serverCalls
    .filter((call) => call.status === 'complete')
    .map(
      (call) =>
        call.outcome ??
        (call.result?.status === 'rejected' || call.error !== undefined
          ? 'failure'
          : 'success'),
    );
  const toolCallCount = serverCalls.length + clientCalls.length;
  const sourceCount = collectTurnSources(turn).length;
  const failedToolCallCount =
    outcomes.filter((outcome) => outcome === 'failure').length +
    clientCalls.filter(
      (call) => call.status === 'done' && call.result.status === 'rejected',
    ).length;
  const deniedToolCallCount = outcomes.filter(
    (outcome) => outcome === 'denied',
  ).length;
  const cancelledToolCallCount = outcomes.filter(
    (outcome) => outcome === 'cancelled',
  ).length;
  const text =
    status === 'working'
      ? newest === undefined
        ? 'Working'
        : getServerToolCallLabel(newest, options?.labels)
      : status === 'awaiting'
        ? 'Waiting for your approval'
        : status === 'failed'
          ? duration === undefined
            ? 'Work failed'
            : `Work failed after ${duration}`
          : status === 'cancelled'
            ? duration === undefined
              ? 'Stopped'
              : `Stopped after ${duration}`
            : duration === undefined
              ? 'Worked'
              : `Worked for ${duration}`;
  const metadata = [
    `${toolCallCount} tool call${toolCallCount === 1 ? '' : 's'}`,
    ...(sourceCount > 0
      ? [`${sourceCount} source${sourceCount === 1 ? '' : 's'}`]
      : []),
    ...(failedToolCallCount > 0 ? [`${failedToolCallCount} failed`] : []),
    ...(deniedToolCallCount > 0 ? [`${deniedToolCallCount} denied`] : []),
    ...(cancelledToolCallCount > 0
      ? [`${cancelledToolCallCount} cancelled`]
      : []),
    ...(active && duration !== undefined ? [duration] : []),
  ];

  return {
    status,
    text,
    meta: `· ${metadata.join(' · ')}`,
    live: status === 'working',
    toolCallCount,
    sourceCount,
    failedToolCallCount,
    deniedToolCallCount,
    cancelledToolCallCount,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}
