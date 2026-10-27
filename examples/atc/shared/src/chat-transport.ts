import {
  createHttpTransport,
  type HttpResponseRetryContext,
  type Transport,
} from '@hashbrownai/core';

/** Checks that a decoded error is an object before reading its fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Selects only B4's rejected, pre-execution shared-run admission response. */
function isRunAdmissionConflict(context: HttpResponseRetryContext): boolean {
  if (
    context.status !== 409 ||
    context.bodyTruncated ||
    typeof context.retryAfterMs !== 'number' ||
    context.retryAfterMs <= 0
  )
    return false;

  try {
    const body: unknown = JSON.parse(context.bodyText);
    if (!isRecord(body) || !isRecord(body['error'])) return false;
    const error = body['error'];
    return (
      error['kind'] === 'request_error' &&
      isRecord(error['details']) &&
      error['details']['code'] === 'run_in_flight'
    );
  } catch {
    return false;
  }
}

/**
 * Creates ATC's chat transport with bounded recovery from B4 admission conflicts.
 * Browser tools and pinned schemas retain the same request across HTTP retries.
 * Other errors keep Hashbrown's existing error and manual Retry behavior.
 *
 * @param fetchImpl - Optional fetch override for deterministic validation.
 * @returns A chat transport for `/api/run`, shared by Angular and React.
 */
export function createAtcChatTransport(fetchImpl?: typeof fetch): Transport {
  return createHttpTransport({
    baseUrl: '/api/run',
    fetchImpl,
    retry: {
      maxRetries: 60,
      maxElapsedMs: 60_000,
      shouldRetry: isRunAdmissionConflict,
    },
  });
}
