/** One recorded AG-UI event. */
export interface TapeEntry {
  event: Record<string, unknown> & { type?: unknown };
}

/** A recorded AG-UI run used to replay a real assistant answer deterministically. */
export interface AgUiTape {
  version: 1;
  recordedAt: string;
  question: string;
  events: TapeEntry[];
}

const FORBIDDEN_TYPES = [
  'RAW',
  'CUSTOM',
  'REASONING_START',
  'REASONING_MESSAGE_START',
  'REASONING_MESSAGE_CONTENT',
  'REASONING_MESSAGE_END',
  'REASONING_END',
  'THINKING_START',
  'THINKING_END',
  'THINKING_TEXT_MESSAGE_START',
  'THINKING_TEXT_MESSAGE_CONTENT',
  'THINKING_TEXT_MESSAGE_END',
];
const SECRET = /sk-[A-Za-z0-9_-]{3,}|authorization/i;

/**
 * Parse a server-sent event body into AG-UI event objects.
 *
 * @param body - The raw `text/event-stream` body.
 */
export function parseSseEvents(body: string): Record<string, unknown>[] {
  return body
    .split(/\n\n+/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((data) => data.length > 0)
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * Whether a `render` tool result reports success. B4 streams tool results as
 * serialized LangChain `ToolMessage`s whose `kwargs.content` holds the tool's
 * own JSON, so unwrap that envelope when present.
 *
 * @param content - The `content` field of a `TOOL_CALL_RESULT` event.
 */
export function isRenderSuccess(content: unknown): boolean {
  const parsed = parseJson(content) as
    | { kwargs?: { status?: string; content?: unknown }; rendered?: unknown }
    | undefined;
  if (parsed?.kwargs) {
    if (parsed.kwargs.status === 'error') return false;
    return isRenderSuccess(parsed.kwargs.content);
  }
  return parsed?.rendered === true;
}

/**
 * List the problems that make a take unfit to commit. An empty list means the take is valid.
 *
 * @param tape - The recorded take.
 */
export function validateTape(tape: AgUiTape): string[] {
  const events = tape.events.map((entry) => entry.event);
  const problems: string[] = [];
  const renderCalls = new Set(
    events
      .filter(
        (e) => e.type === 'TOOL_CALL_START' && e['toolCallName'] === 'render',
      )
      .map((e) => e['toolCallId']),
  );
  const rendered = events.some(
    (e) =>
      e.type === 'TOOL_CALL_RESULT' &&
      renderCalls.has(e['toolCallId']) &&
      isRenderSuccess(e['content']),
  );
  if (!rendered) problems.push('missing successful render tool call');
  if (events.at(-1)?.type !== 'RUN_FINISHED')
    problems.push('does not end with RUN_FINISHED');
  for (const type of FORBIDDEN_TYPES) {
    if (events.some((e) => e.type === type))
      problems.push(`contains ${type} event`);
  }
  if (SECRET.test(JSON.stringify(events)))
    problems.push('contains a secret-like value');
  return problems;
}

/**
 * Prepare a tape for replay against a new request: rewrite run identity and drop message snapshots.
 *
 * @param tape - The committed take.
 * @param identity - The incoming request's thread and run IDs.
 */
export function prepareReplay(
  tape: AgUiTape,
  identity: { threadId: string; runId: string },
): Record<string, unknown>[] {
  return tape.events
    .map((entry) => entry.event)
    .filter((event) => event.type !== 'MESSAGES_SNAPSHOT')
    .map((event) =>
      event.type === 'RUN_STARTED' || event.type === 'RUN_FINISHED'
        ? { ...event, ...identity }
        : event,
    );
}
