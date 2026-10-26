/** Persistence accepts only projected metadata, never arbitrary logs, exceptions or bodies. */
export interface LiveDiagnosticSink {
  readonly write: (sanitizedJsonLine: string) => void;
}

const enums: Readonly<Record<string, readonly string[]>> = Object.freeze({
  provider: ['openai', 'azure'],
  api: ['responses', 'chat-completions'],
  auth: ['api-key', 'azure-cli'],
  method: ['GET', 'POST'],
  authentication: ['api-key', 'bearer', 'missing'],
  model: ['gpt-4.1-mini'],
  path: [
    '/v1/responses',
    '/openai/v1/responses',
    '/run',
    '/health',
    '/checkpoint',
    '/openai/deployments/gpt-4.1-mini/chat/completions',
  ],
  stage: [
    'starting',
    'ready',
    'acquiring',
    'streaming',
    'paused',
    'cancelled',
    'completed',
    'failed',
  ],
});
const numbers = [
  'durationMs',
  'inputTokens',
  'outputTokens',
  'calls',
  'effects',
  'reservedCalls',
  'dispatchedCalls',
  'cancelledCalls',
];

/** Projects and bounds metadata before invoking any caller-owned stdout/file/report sink. */
export function createLiveDiagnostics(sink: LiveDiagnosticSink) {
  let state: Readonly<{ bytes: number; dropped: number }> = Object.freeze({
    bytes: 0,
    dropped: 0,
  });
  return Object.freeze({
    record: (input: Readonly<Record<string, unknown>>) => {
      const safe: Record<string, unknown> = Object.fromEntries(
        Object.entries(enums).flatMap(([key, allowed]) =>
          typeof input[key] === 'string' &&
          allowed.includes(input[key] as string)
            ? [[key, input[key]]]
            : [],
        ),
      );
      for (const key of numbers)
        if (
          typeof input[key] === 'number' &&
          Number.isSafeInteger(input[key]) &&
          (input[key] as number) >= 0
        )
          safe[key] = input[key];
      if (
        typeof input['status'] === 'number' &&
        Number.isInteger(input['status']) &&
        input['status'] >= 100 &&
        input['status'] <= 599
      )
        safe['status'] = input['status'];
      const line = `${JSON.stringify(safe)}\n`;
      const bytes = Buffer.byteLength(line);
      if (state.bytes + bytes > 2 * 1024 * 1024) {
        state = Object.freeze({ ...state, dropped: state.dropped + 1 });
        return;
      }
      state = Object.freeze({ ...state, bytes: state.bytes + bytes });
      sink.write(line);
    },
    snapshot: () => state,
  });
}

/**
 * Discards child output; only a validated listening origin survives in memory.
 * The bounded partial stdout line is never exposed or sent to a persistence sink.
 */
export function createLiveOutputReader() {
  let partial = '';
  let origin: string | undefined;
  return Object.freeze({
    stdout: (chunk: Uint8Array) => {
      if (origin) return;
      const lines = (partial + Buffer.from(chunk).toString('utf8')).split(
        /\r?\n/,
      );
      partial = (lines.pop() ?? '').slice(-512);
      for (const line of lines) {
        const match = line.match(
          /Now listening on: (http:\/\/127\.0\.0\.1:\d+)$/,
        );
        if (!match) continue;
        try {
          const url = new URL(match[1]);
          if (url.port && Number(url.port) > 0 && Number(url.port) <= 65535) {
            origin = url.origin;
            partial = '';
            return;
          }
        } catch {
          /* Invalid ports and malformed URLs are discarded with the raw line. */
        }
      }
    },
    stderr: (_chunk: Uint8Array) => undefined,
    url: () => origin,
  });
}

const safeCodes = [
  'LIVE_CHILD_FAILED',
  'LIVE_CHILD_TIMEOUT',
  'LIVE_CHILD_START_FAILED',
  'LIVE_PROVIDER_FAILED',
  'LIVE_ASSERTION_FAILED',
  'LIVE_UNKNOWN_FAILURE',
] as const;

/** Returns a fixed-code failure, deliberately discarding every raw error field and cause. */
export function safeLiveError(code: string, _raw?: unknown): Error {
  if (!(safeCodes as readonly string[]).includes(code))
    throw new Error('LIVE_UNKNOWN_FAILURE');
  const error = new Error(code);
  error.stack = code;
  return error;
}
