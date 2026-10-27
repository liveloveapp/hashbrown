import type { WorkbenchFrame } from './workbench';

/** Whether a row is a network request or a browser tool call. */
export type WorkbenchExchangeKind = 'request' | 'tool';

/** The names a request row can carry; tool rows carry the tool's name. */
export type WorkbenchExchangeName =
  | 'Model request'
  | 'Decision request'
  | 'Continuation'
  | 'Resume'
  | 'Retry'
  | 'Follow-up request';

/** One request or tool call derived from the captured events. */
export interface WorkbenchExchange {
  /** `${kind}-${firstIndex}`. */
  readonly id: string;
  readonly kind: WorkbenchExchangeKind;
  /** A {@link WorkbenchExchangeName}, or the tool name. */
  readonly name: string;
  readonly turn: number;
  /** Tool rows: the request that called them. */
  readonly parentId?: string;
  /** Tool rows: the continuation request that answered them. */
  readonly answeredById?: string;
  /** Index into the events array. */
  readonly firstIndex: number;
  readonly lastIndex: number;
  /** Every event attached; request rows include the request event. */
  readonly eventIndexes: readonly number[];
  readonly startMs: number;
  readonly endMs: number;
  /** `cancelled` marks a request the user stopped before it finished. */
  readonly status: 'pending' | 'ok' | 'error' | 'cancelled';
  readonly httpStatus?: number;
  /** `POST` for requests, an empty string for tools. */
  readonly method: string;
  /** Pathname of the captured URL, or of the configured endpoint. */
  readonly path?: string;
  /** True when the path came from the lesson endpoint, not a capture. */
  readonly pathConfigured: boolean;
  /** The request event payload, as captured. */
  readonly request?: unknown;
  /** The `response` event payload. */
  readonly response?: unknown;
  readonly tool?: {
    readonly name: string;
    readonly result: unknown;
    readonly callId?: string;
  };
  /** The `problem` text of the response payload. */
  readonly problem?: string;
}

/** One turn's rows: each request followed by its tool children. */
export interface WorkbenchTurnExchanges {
  readonly turn: number;
  /** The last `user` event text in the turn, or an empty string. */
  readonly userText: string;
  readonly exchanges: readonly WorkbenchExchange[];
}

/** Lesson context that changes how exchanges are named and judged. */
export interface WorkbenchExchangeOptions {
  /** The lesson format; `decision` and `selection` carry no URL or response. */
  readonly format?: string;
  /** The configured endpoint, shown for requests that carry no URL. */
  readonly endpoint?: string;
  /** The store's current status, used to fail or cancel the last exchange. */
  readonly settledStatus?: string;
}

interface Draft {
  kind: WorkbenchExchangeKind;
  name: string;
  turn: number;
  firstIndex: number;
  startMs: number;
  request?: Record<string, unknown>;
  parentIndex?: number;
  /** Event index of the continuation request. */
  answeredByIndex?: number;
  eventIndexes: number[];
  endMs: number;
  response?: Record<string, unknown>;
  finished: boolean;
  failed: boolean;
  cancelled: boolean;
  decided: boolean;
  tool?: WorkbenchExchange['tool'];
}

type Marker = 'tool' | 'resume' | undefined;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const pathname = (url: unknown): string | undefined => {
  if (typeof url !== 'string' || !url) return undefined;
  try {
    return new URL(url, 'http://workbench.invalid').pathname;
  } catch {
    return undefined;
  }
};

/**
 * Derives request and tool-call exchanges from the captured events.
 *
 * A `request` event opens an exchange; the `response`, `event`, `source`,
 * `error` and `parsed` events that follow attach to it until the next request.
 * A `tool` event becomes a child row under the current request, and the next
 * request after a tool is that tool's continuation. Events before a turn's
 * first request belong to no exchange, and turns without a request are omitted.
 *
 * @param events - The captured events, in order.
 * @param options - The lesson format, configured endpoint and settled status.
 * @returns The exchanges grouped by turn.
 */
export function workbenchExchanges(
  events: readonly WorkbenchFrame[],
  options: WorkbenchExchangeOptions,
): readonly WorkbenchTurnExchanges[] {
  const decisionLesson =
    options.format === 'decision' || options.format === 'selection';
  const configuredPath = pathname(options.endpoint);

  // Local accumulation only; the caller receives fresh readonly results.
  const drafts: Draft[] = [];
  const userTexts = new Map<number, string>();
  let current = -1; // index into drafts of the open request
  let marker: Marker;
  let toolsSinceRequest: number[] = [];
  let previousRequestId: unknown;
  let turnOfCurrent = -1;

  events.forEach((frame, index) => {
    const payload = record(frame.payload);
    if (frame.kind === 'user') {
      const text = payload?.['content'] ?? payload?.['text'];
      if (typeof text === 'string') userTexts.set(frame.turn, text);
      return;
    }
    if (frame.kind === 'resume') {
      marker = 'resume';
      return;
    }
    if (frame.kind === 'request') {
      const sameTurn = turnOfCurrent === frame.turn && current >= 0;
      const attempt = payload?.['attempt'];
      const name: string = !sameTurn
        ? decisionLesson
          ? 'Decision request'
          : 'Model request'
        : marker === 'tool'
          ? 'Continuation'
          : marker === 'resume'
            ? 'Resume'
            : (payload?.['requestId'] !== undefined &&
                  payload['requestId'] === previousRequestId) ||
                (typeof attempt === 'number' && attempt > 1)
              ? 'Retry'
              : 'Follow-up request';
      if (name === 'Continuation')
        toolsSinceRequest.forEach((toolIndex) => {
          drafts[toolIndex].answeredByIndex = index;
        });
      drafts.push({
        kind: 'request',
        name,
        turn: frame.turn,
        firstIndex: index,
        startMs: frame.elapsedMs,
        request: payload,
        eventIndexes: [index],
        endMs: frame.elapsedMs,
        finished: false,
        failed: false,
        cancelled: false,
        decided: false,
      });
      current = drafts.length - 1;
      turnOfCurrent = frame.turn;
      marker = undefined;
      toolsSinceRequest = [];
      previousRequestId = payload?.['requestId'];
      return;
    }
    if (current < 0 || turnOfCurrent !== frame.turn) return;
    if (frame.kind === 'tool') {
      const name = typeof payload?.['name'] === 'string' ? payload['name'] : '';
      // Two calls of one tool in a response take their ids in order.
      const taken = new Set(
        toolsSinceRequest.map((toolIndex) => drafts[toolIndex].tool?.callId),
      );
      const callId = events
        .slice(drafts[current].firstIndex, index)
        .map((earlier) => record(earlier.payload))
        .find(
          (earlier) =>
            (earlier?.['type'] === 'TOOL_CALL_START' ||
              earlier?.['type'] === 'TOOL_CALL_END') &&
            earlier['toolCallName'] === name &&
            typeof earlier['toolCallId'] === 'string' &&
            !taken.has(earlier['toolCallId']),
        )?.['toolCallId'] as string | undefined;
      drafts.push({
        kind: 'tool',
        name,
        turn: frame.turn,
        firstIndex: index,
        startMs: frame.elapsedMs,
        parentIndex: current,
        eventIndexes: [index],
        endMs: frame.elapsedMs,
        finished: true,
        failed: false,
        cancelled: false,
        decided: false,
        tool: {
          name,
          result: payload?.['result'],
          ...(callId ? { callId } : {}),
        },
      });
      toolsSinceRequest.push(drafts.length - 1);
      marker = 'tool';
      return;
    }
    if (
      !['response', 'event', 'source', 'error', 'parsed', 'cancel'].includes(
        frame.kind,
      )
    )
      return;
    const open = drafts[current];
    const type = payload?.['type'];
    open.eventIndexes.push(index);
    open.endMs = frame.elapsedMs;
    if (frame.kind === 'response') open.response = payload;
    if (type === 'RUN_FINISHED') open.finished = true;
    if (frame.kind === 'error' || type === 'RUN_ERROR') open.failed = true;
    if (frame.kind === 'cancel') open.cancelled = true;
    if (decisionLesson && frame.kind === 'event') open.decided = true;
  });

  const lastRequest = drafts.reduce(
    (last, draft, i) => (draft.kind === 'request' ? i : last),
    -1,
  );
  // The settled status belongs to the latest turn, which may have no request.
  const lastTurn = events.at(-1)?.turn;

  const exchanges = drafts.map((draft, position): WorkbenchExchange => {
    const lastIndex = draft.eventIndexes.at(-1) ?? draft.firstIndex;
    const id = `${draft.kind}-${draft.firstIndex}`;
    const base = {
      id,
      kind: draft.kind,
      name: draft.name,
      turn: draft.turn,
      firstIndex: draft.firstIndex,
      lastIndex,
      eventIndexes: draft.eventIndexes,
      startMs: draft.startMs,
      endMs: draft.endMs,
    };
    if (draft.kind === 'tool')
      return {
        ...base,
        parentId: `request-${drafts[draft.parentIndex ?? 0].firstIndex}`,
        ...(draft.answeredByIndex === undefined
          ? {}
          : { answeredById: `request-${draft.answeredByIndex}` }),
        status: 'ok',
        method: '',
        pathConfigured: false,
        tool: draft.tool,
      };
    const status = draft.response?.['status'];
    const httpStatus = typeof status === 'number' ? status : undefined;
    const capturedPath =
      pathname(draft.request?.['url']) ?? pathname(draft.response?.['url']);
    const path = capturedPath ?? configuredPath;
    const problem = draft.response?.['problem'];
    const laterRequest = drafts.some(
      (other, i) =>
        i > position && other.kind === 'request' && other.turn === draft.turn,
    );
    const isLast = position === lastRequest && draft.turn === lastTurn;
    const failed =
      (httpStatus !== undefined && httpStatus >= 400) ||
      draft.failed ||
      (isLast && options.settledStatus === 'error');
    const done = laterRequest || draft.finished || draft.decided;
    const cancelled =
      !done &&
      (draft.cancelled || (isLast && options.settledStatus === 'cancelled'));
    return {
      ...base,
      status: failed
        ? 'error'
        : done
          ? 'ok'
          : cancelled
            ? 'cancelled'
            : 'pending',
      ...(httpStatus === undefined ? {} : { httpStatus }),
      method: 'POST',
      ...(path === undefined ? {} : { path }),
      pathConfigured:
        capturedPath === undefined && configuredPath !== undefined,
      request: draft.request,
      ...(draft.response === undefined ? {} : { response: draft.response }),
      ...(typeof problem === 'string' ? { problem } : {}),
    };
  });

  const turns = [...new Set(exchanges.map((exchange) => exchange.turn))];
  return turns.map((turn) => ({
    turn,
    userText: userTexts.get(turn) ?? '',
    exchanges: exchanges.filter((exchange) => exchange.turn === turn),
  }));
}
