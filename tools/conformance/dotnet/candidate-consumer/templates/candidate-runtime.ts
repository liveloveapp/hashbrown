import {
  type ConversationRecoveryConfiguration,
  type ConversationRestoreOptions,
  type ConversationSnapshot,
  HttpTransport,
  type JsonValue,
  type ResumeConversationRecoveryOptions,
  s,
  type Transport,
} from '@hashbrownai/core';
import {
  type CandidateDeadlineRecord,
  createCandidateDeadlineTransport,
} from './deadline-transport';

/** Owned runner configuration; it contains no retained recovery authority. */
export interface CandidateConfiguration {
  readonly facade:
    | 'chat'
    | 'structured-chat'
    | 'completion'
    | 'structured-completion'
    | 'ui-chat'
    | 'ui-completion';
  readonly scenarioId: string;
  readonly threadId: string;
  readonly principal: string;
  readonly endpoint: string;
  readonly observer: Readonly<{ entryUrl: string; holdBaseUrl: string }>;
  readonly prompt: string;
  readonly nextPrompt: string;
  readonly deadlineMs: number;
}

/** A browser-consumed transport event, observed before yielding that same event. */
export interface CandidateEventRecord {
  readonly type: string;
  readonly runId: string;
  readonly requestId: string;
  readonly monotonicMs: number;
}

/** Narrow presentation callbacks supplied explicitly by each actual public facade leaf. */
export interface CandidatePanelActions {
  readonly start: (prompt: string) => void;
  readonly next: (prompt: string) => void;
  readonly stop: () => void;
  readonly configuration: () => ConversationRecoveryConfiguration;
  readonly restore: (
    snapshot: ConversationSnapshot,
    options: ConversationRestoreOptions,
  ) => void;
  readonly settle: (options: ResumeConversationRecoveryOptions) => void;
  readonly restored?: () => void;
  readonly negatives: Readonly<Record<string, () => void>>;
}

/** Narrows parsed configuration data without invoking arbitrary getters. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Requires an explicit owned HTTP loopback URL. */
function loopback(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Owned URL required');
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  )
    throw new Error('Owned loopback URL required');
  return value;
}

/** Reads the explicit immutable URL configuration; no environment or storage fallback. */
export function readCandidateConfiguration(): CandidateConfiguration {
  const encoded = new URL(location.href).searchParams.get('config');
  if (!encoded) throw new Error('Explicit candidate configuration required');
  const value: unknown = JSON.parse(encoded);
  if (
    !record(value) ||
    !record(value.observer) ||
    ![
      'chat',
      'structured-chat',
      'completion',
      'structured-completion',
      'ui-chat',
      'ui-completion',
    ].includes(String(value.facade)) ||
    !['scenarioId', 'threadId', 'principal', 'prompt', 'nextPrompt'].every(
      (key) => {
        const entry = value[key];
        return typeof entry === 'string' && entry.length > 0;
      },
    ) ||
    typeof value.deadlineMs !== 'number' ||
    !Number.isSafeInteger(value.deadlineMs) ||
    value.deadlineMs <= 0 ||
    value.deadlineMs > 2147483647
  )
    throw new Error('Invalid candidate configuration');
  const endpoint = loopback(value.endpoint);
  if (new URL(endpoint).origin !== endpoint)
    throw new Error('Proxy origin required');
  const entryUrl = loopback(value.observer.entryUrl);
  const holdBaseUrl = loopback(value.observer.holdBaseUrl);
  if (new URL(entryUrl).origin !== new URL(holdBaseUrl).origin)
    throw new Error('Observer origin mismatch');
  // Each string is independently narrowed above; no facade object or runtime is cast.
  const facade = value.facade;
  if (
    facade !== 'chat' &&
    facade !== 'structured-chat' &&
    facade !== 'completion' &&
    facade !== 'structured-completion' &&
    facade !== 'ui-chat' &&
    facade !== 'ui-completion'
  )
    throw new Error('Unsupported facade');
  const { scenarioId, threadId, principal, prompt, nextPrompt, deadlineMs } =
    value;
  if (
    typeof scenarioId !== 'string' ||
    typeof threadId !== 'string' ||
    typeof principal !== 'string' ||
    typeof prompt !== 'string' ||
    typeof nextPrompt !== 'string'
  )
    throw new Error('Invalid strings');
  return Object.freeze({
    facade,
    scenarioId,
    threadId,
    principal,
    endpoint,
    observer: Object.freeze({ entryUrl, holdBaseUrl }),
    prompt,
    nextPrompt,
    deadlineMs,
  });
}

/** Stable trusted schemas shared by the actual public facade leaves. */
export const candidateWeatherSchema = s.object('Weather request', {
  city: s.string('Trusted operation correlation'),
});
/** Stable structured response schema used by both framework consumers. */
export const candidateAnswerSchema = s.object('Candidate answer', {
  answer: s.string('Answer'),
});
/** Immutable system configuration supplied unchanged to native recovery reads. */
export const candidateSystem = 'Candidate isolation probe';

/** Narrows an actual JSON HTTP result without assigning an unchecked value. */
function knownJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map(knownJson);
  if (record(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, knownJson(item)]),
    );
  throw new Error('Observer returned a non-JSON result');
}

/** Enters the persistent observer once, then returns its actual released operation result. */
export async function runCandidateWeather(
  config: CandidateConfiguration,
  args: { city: string },
  signal: AbortSignal,
): Promise<JsonValue> {
  const entered = await fetch(config.observer.entryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      correlation: args.city,
      toolName: 'getWeather',
      arguments: args,
    }),
    signal,
  });
  if (entered.status !== 201)
    throw new Error(`Observer entry failed: ${entered.status}`);
  const receipt: unknown = await entered.json();
  if (
    !record(receipt) ||
    typeof receipt.receiptId !== 'string' ||
    typeof receipt.holdUrl !== 'string' ||
    receipt.holdUrl !==
      `${config.observer.holdBaseUrl}/${encodeURIComponent(receipt.receiptId)}`
  )
    throw new Error('Invalid observer receipt');
  const held = await fetch(receipt.holdUrl, { signal });
  if (!held.ok) throw new Error(`Observer hold failed: ${held.status}`);
  const result: unknown = await held.json();
  return knownJson(result);
}

/** Creates a real HTTP transport with a finite full-iterator deadline and passive observations. */
export function createCandidateBrowserRuntime(
  config: CandidateConfiguration,
  changed: () => void,
) {
  let events: readonly CandidateEventRecord[] = [];
  let lifecycle: readonly CandidateDeadlineRecord[] = [];
  const deadline = createCandidateDeadlineTransport({
    delegate: new HttpTransport({
      baseUrl: `${config.endpoint}/run`,
      fetchImpl: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('X-Fixture-Principal', config.principal);
        return fetch(input, { ...init, headers });
      },
    }),
    deadlineMs: config.deadlineMs,
    observe: (entry) => {
      lifecycle = [...lifecycle, entry];
      changed();
    },
  });
  const transport: Transport = {
    name: 'CandidateObservedHttpTransport',
    async send(request) {
      const response = await deadline.send(request);
      return {
        ...response,
        events: (async function* () {
          for await (const event of response.events) {
            events = [
              ...events,
              {
                type: event.type,
                runId:
                  'runId' in event && typeof event.runId === 'string'
                    ? event.runId
                    : request.input.runId,
                requestId: request.requestId,
                monotonicMs: performance.now(),
              },
            ];
            try {
              changed();
            } catch {
              /* Passive observation cannot change transport behavior. */
            }
            yield event;
          }
        })(),
        dispose: response.dispose,
      };
    },
  };
  return { transport, observations: () => ({ events, transport: lifecycle }) };
}

/** Opens an entirely new conversation without retaining pending tokens, choices or messages. */
export function openCandidateThread(config: CandidateConfiguration): void {
  const url = new URL(location.href);
  url.searchParams.set(
    'config',
    JSON.stringify({ ...config, threadId: `candidate-${crypto.randomUUID()}` }),
  );
  location.assign(url.href);
}

/** Converts actual caught exceptions into escaped display data. */
export function candidateError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

let configEpoch = 0;
let activeConfigEpoch: number | undefined;

/** Marks only the explicit test-owned configuration button's actual effect attempt. */
export function beginCandidateConfigAction(): number {
  activeConfigEpoch = ++configEpoch;
  return activeConfigEpoch;
}

/** Clears a completed or observed attempt without clearing a newer action. */
export function finishCandidateConfigAction(epoch: number | undefined): void {
  if (activeConfigEpoch === epoch) activeConfigEpoch = undefined;
}

/** Captures the actual thrown framework exception and its explicit action context. */
export function candidateFrameworkError(error: unknown) {
  return {
    classification:
      activeConfigEpoch === undefined ? 'runtime-error' : 'config-error',
    epoch: activeConfigEpoch ?? null,
    error: candidateError(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
  };
}
