import type { LifecycleResendClient } from './campaign/send.ts';
import type { RecipientResendClient } from './growth.ts';

/** What `emails.send` resolves to: the Resend SDK's `{ data, error }` shape. */
export type ResendSendResult = Awaited<
  ReturnType<RecipientResendClient['emails']['send']>
>;

type ResendError = NonNullable<ResendSendResult['error']>;

/** Options for {@link createResendFetchClient}. */
export interface ResendFetchClientOptions {
  /** The Resend sending key; sent only as the bearer, never logged or returned. */
  apiKey: string;
  /** The fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Abort the request, body read included, after this many milliseconds. */
  timeoutMs?: number;
}

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const MAX_RESPONSE_BYTES = 64 * 1024;

class ResponseTooLargeError extends Error {}

/**
 * Reads at most {@link MAX_RESPONSE_BYTES} of a response body as text.
 *
 * @throws {ResponseTooLargeError} When the body is larger than the cap.
 */
async function readCappedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError('Resend response exceeded 64 KiB');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An outcome-unknown error: `statusCode: null` makes growth's
 * `classifyResendProviderError` answer `unknown`, so the send is never
 * treated as rejected when Resend may have accepted it.
 */
function unknownOutcome(message: string): ResendSendResult {
  return {
    data: null,
    error: { name: 'application_error', message, statusCode: null },
  };
}

/**
 * A minimal Resend client over `fetch` for the lifecycle service. It replaces
 * the `resend` SDK, whose optional dynamic `import("@react-email/render")`
 * cannot be bundled into the closed b4run Vercel function.
 *
 * `emails.send(payload, { idempotencyKey })` posts to
 * `https://api.resend.com/emails` with `Authorization: Bearer <apiKey>`,
 * `Content-Type: application/json` and `Idempotency-Key`, mapping `replyTo`
 * to `reply_to` (every other field is passed through). It resolves, and never
 * rejects, with the SDK's shape: a 2xx with a string `id` is
 * `{ data: { id }, error: null }`; a non-2xx JSON error body is that
 * `{ name, message, statusCode }`, with the HTTP status when the body omits
 * one; a network error, timeout, non-JSON or over-64-KiB body, or a 2xx
 * without `id` is `application_error` with `statusCode: null`. The API key is
 * redacted from every returned message; nothing is logged.
 *
 * @param options - See {@link ResendFetchClientOptions}.
 * @returns A client satisfying the lifecycle's Resend interface.
 */
export function createResendFetchClient({
  apiKey,
  fetch = globalThis.fetch,
  timeoutMs = 10_000,
}: ResendFetchClientOptions): LifecycleResendClient {
  const redact = (text: string): string =>
    apiKey ? text.split(apiKey).join('[redacted]') : text;

  return {
    emails: {
      async send(payload, { idempotencyKey }): Promise<ResendSendResult> {
        const { replyTo, ...rest } = payload as typeof payload & {
          replyTo?: string;
        };
        const body = {
          ...rest,
          ...(replyTo === undefined ? {} : { reply_to: replyTo }),
        };
        let status: number;
        let text: string;
        try {
          const signal = AbortSignal.timeout(timeoutMs);
          const response = await fetch(RESEND_EMAILS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(body),
            signal,
          });
          status = response.status;
          text = await readCappedText(response);
        } catch (error) {
          const kind =
            error instanceof ResponseTooLargeError
              ? 'response exceeded 64 KiB'
              : error instanceof Error && error.name
                ? error.name
                : 'unknown error';
          return unknownOutcome(`Resend request failed: ${kind}`);
        }

        const parsed = parseJson(text);
        if (status >= 200 && status < 300) {
          return isRecord(parsed) && typeof parsed['id'] === 'string'
            ? { data: { id: parsed['id'] }, error: null }
            : unknownOutcome(`Resend answered ${status} without an email id`);
        }
        if (!isRecord(parsed)) {
          return unknownOutcome(
            `Resend answered ${status} with a non-JSON body`,
          );
        }
        const error: ResendError = {
          name: (typeof parsed['name'] === 'string'
            ? parsed['name']
            : 'application_error') as ResendError['name'],
          message: redact(
            typeof parsed['message'] === 'string'
              ? parsed['message']
              : `Resend answered ${status}`,
          ),
          statusCode:
            typeof parsed['statusCode'] === 'number'
              ? parsed['statusCode']
              : status,
        };
        return { data: null, error };
      },
    },
  };
}
