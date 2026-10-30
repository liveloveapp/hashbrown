const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MARKETING_RESPONSE_MAX_BYTES = 64 * 1_024;
const INVALID_MARKETING_STATE = 'Marketing dispatch returned invalid state';

/** Input for {@link invokeMarketing}. */
export interface InvokeMarketingInput {
  baseUrl: string;
  serviceSecret: string;
  /** Milliseconds to wait for the tick, 250..60 000; defaults to 15 000. */
  timeoutMs?: number;
  trigger: 'cron';
}

/** Replaceable collaborators, for tests. */
export interface InvokeMarketingDependencies {
  fetch: typeof fetch;
  /** The b4run thread a trigger's run uses. */
  threadId: (trigger: InvokeMarketingInput['trigger']) => string;
}

/**
 * The one b4run thread the cron reuses. The cron deletes it after every run
 * the service answered, so a thread left by a run the client timed out on is
 * reused and deleted later instead of piling up. b4run refuses (409) a run on
 * a thread that is still executing, which also keeps two ticks from
 * overlapping.
 */
export const MARKETING_THREAD_ID = '844cc27b-a87f-442f-8a3f-92f8a86ced44';

/** An alert the marketing service raises for a human operator. */
export type MarketingOperatorAlert =
  'post_failed' | 'blog_not_live' | 'credential_expiring';

const OPERATOR_ALERTS: readonly string[] = [
  'post_failed',
  'blog_not_live',
  'credential_expiring',
];

/** The validated outcome of one marketing dispatch. */
export interface InvokeMarketingResult {
  operatorAlerts: MarketingOperatorAlert[];
  threadId: string;
}

/**
 * A marketing dispatch failure after the request was built. It carries the
 * b4run thread id so the caller can still delete the thread the run left
 * behind. Its message is always one of the client's closed messages.
 */
export class MarketingInvokeError extends Error {
  constructor(
    message: string,
    /** The b4run thread the failed dispatch used. */
    readonly threadId: string,
    /**
     * Whether the service answered. False for request-stage failures
     * (timeout, network, abort), where the run may still be executing.
     */
    readonly runCompleted: boolean,
  ) {
    super(message);
    this.name = 'MarketingInvokeError';
  }
}

const defaultDependencies: InvokeMarketingDependencies = {
  fetch,
  threadId: () => MARKETING_THREAD_ID,
};

function marketingBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Marketing base URL is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Marketing base URL must be an HTTPS origin');
  }
  return url.origin;
}

function timeout(value: number | undefined): number {
  const resolved = value ?? 15_000;
  if (!Number.isInteger(resolved) || resolved < 250 || resolved > 60_000) {
    throw new Error(
      'Marketing timeout must be between 250 and 60000 milliseconds',
    );
  }
  return resolved;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseMarketingState(
  value: unknown,
  input: Pick<InvokeMarketingInput, 'trigger'>,
): MarketingOperatorAlert[] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['trigger', 'result']) ||
    value['trigger'] !== input.trigger ||
    !isRecord(value['result'])
  ) {
    throw new Error(INVALID_MARKETING_STATE);
  }
  const result = value['result'];
  if (
    !exactKeys(result, [
      'leased',
      'published',
      'failed',
      'held',
      'operatorAlerts',
    ]) ||
    !isCount(result['leased']) ||
    !isCount(result['published']) ||
    !isCount(result['failed']) ||
    !isCount(result['held']) ||
    !Array.isArray(result['operatorAlerts']) ||
    !result['operatorAlerts'].every(
      (alert) => typeof alert === 'string' && OPERATOR_ALERTS.includes(alert),
    )
  ) {
    throw new Error(INVALID_MARKETING_STATE);
  }
  return [...new Set(result['operatorAlerts'] as MarketingOperatorAlert[])];
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body !== null && !response.body.locked) {
    await response.body.cancel().catch(() => undefined);
  }
}

async function readMarketingState(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    const byteLength = Number(normalizedLength);
    if (
      !/^\d+$/u.test(normalizedLength) ||
      !Number.isSafeInteger(byteLength) ||
      byteLength > MARKETING_RESPONSE_MAX_BYTES
    ) {
      await cancelResponseBody(response);
      throw new Error(INVALID_MARKETING_STATE);
    }
  }

  if (response.body === null) {
    throw new Error(INVALID_MARKETING_STATE);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decoded: string[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MARKETING_RESPONSE_MAX_BYTES) {
        throw new Error(INVALID_MARKETING_STATE);
      }
      decoded.push(decoder.decode(value, { stream: true }));
    }
    decoded.push(decoder.decode());
    return JSON.parse(decoded.join('')) as unknown;
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error(INVALID_MARKETING_STATE);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Runs one marketing dispatch on the marketing service and returns its operator
 * alerts. The response must match the dispatch state exactly and stay under
 * 64 KiB; redirects are refused.
 *
 * @param input - The service origin, bearer secret, timeout and trigger.
 * @param dependencies - Collaborators to replace, for tests.
 * @throws With a closed message when the request or the response is invalid.
 */
export async function invokeMarketing(
  input: InvokeMarketingInput,
  dependencies: Partial<InvokeMarketingDependencies> = {},
): Promise<InvokeMarketingResult> {
  const resolved = { ...defaultDependencies, ...dependencies };
  const origin = marketingBaseUrl(input.baseUrl);
  if (!input.serviceSecret) {
    throw new Error('Marketing service secret is required');
  }
  const threadId = resolved.threadId(input.trigger);
  if (!UUID_V4.test(threadId)) {
    throw new Error('Marketing thread ID must be a UUID v4');
  }

  const timeoutMs = timeout(input.timeoutMs);
  let response: Response;
  try {
    response = await resolved.fetch(`${origin}/threads/${threadId}/runs/wait`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.serviceSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        route: '/dispatch#workflow',
        input: {
          trigger: input.trigger,
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MarketingInvokeError(
      'Marketing dispatch request failed',
      threadId,
      false,
    );
  }
  try {
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new Error('Marketing dispatch was not accepted');
    }
    const state = await readMarketingState(response);
    return {
      operatorAlerts: parseMarketingState(state, input),
      threadId,
    };
  } catch (error) {
    throw new MarketingInvokeError(
      error instanceof Error ? error.message : INVALID_MARKETING_STATE,
      threadId,
      true,
    );
  }
}

/** Input for {@link deleteMarketingThread}. */
export interface DeleteMarketingThreadInput {
  baseUrl: string;
  serviceSecret: string;
  /** The thread a marketing run used. */
  threadId: string;
  /** Milliseconds to wait for the delete. */
  timeoutMs: number;
}

/** The longest a caller waits for a thread delete. */
export const MARKETING_THREAD_DELETE_TIMEOUT_MS = 5_000;

/**
 * Deletes the b4run thread (and its checkpoints) a marketing run left behind.
 * Best effort and never throws: 2xx and 404 are done; any other status, a
 * network error or a timeout is logged as `[marketing-thread-delete-failed]`
 * with the status or the error name only, and swallowed. b4run refuses (409)
 * while the run is still executing, so the thread of a run that the client
 * timed out on usually stays.
 *
 * @param input - The service origin, bearer secret, thread id and timeout.
 * @param dependencies - Collaborators to replace, for tests.
 */
export async function deleteMarketingThread(
  input: DeleteMarketingThreadInput,
  dependencies: Partial<Pick<InvokeMarketingDependencies, 'fetch'>> = {},
): Promise<void> {
  try {
    const origin = marketingBaseUrl(input.baseUrl);
    const fetcher = dependencies.fetch ?? fetch;
    const response = await fetcher(
      `${origin}/threads/${encodeURIComponent(input.threadId)}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${input.serviceSecret}` },
        redirect: 'error',
        signal: AbortSignal.timeout(input.timeoutMs),
      },
    );
    await cancelResponseBody(response);
    if (!response.ok && response.status !== 404) {
      console.warn('[marketing-thread-delete-failed]', response.status);
    }
  } catch (error) {
    console.warn(
      '[marketing-thread-delete-failed]',
      error instanceof Error ? error.name : 'unknown',
    );
  }
}

/**
 * The thread worth deleting after a failed dispatch: only when the service
 * answered. A run the client gave up on may still be executing, so the delete
 * would be refused (409) and only add latency.
 */
export function marketingThreadId(outcome: unknown): string | undefined {
  if (outcome instanceof MarketingInvokeError && outcome.runCompleted) {
    return outcome.threadId;
  }
  return undefined;
}
