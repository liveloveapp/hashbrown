import { ɵcompileDecision } from '@hashbrownai/core';
import type { DecidableSchema, Decision } from '@hashbrownai/core';
import { DecisionError } from './decision-error';
import { fromNativeResponse } from './native/from-native';
import type { NativeRequest, NativeResponse } from './native/native.types';
import { toNativeRequest } from './native/to-native';

const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
/** About Jev's default 64k-token limit, at roughly four characters a token. */
const MAX_REQUEST_CHARACTERS = 256_000;
/** About Jev's 262k-token long-context limit. */
const MAX_LONG_CONTEXT_REQUEST_CHARACTERS = 1_048_000;
/** The longest vendor error detail copied into a {@link DecisionError} message. */
const MAX_ERROR_DETAIL = 300;
const MAX_OPTIONS = 255;
const MIN_LEVELS = 2;
const MAX_LEVELS = 10;
const RETRY_DELAYS_MS = [250, 500];
/** Documented at https://docs.typesafe.ai/models.md (raises limits to 262k tokens). */
const LONG_CONTEXT_HEADER = 'TypeSafe-Danger-Zone-Long-Context';

/**
 * Options for {@link HashbrownTypeSafe.decide}.
 *
 * @public
 */
export interface TypeSafeDecideOptions {
  /** The TypeSafe API key. Keep it on the server. */
  apiKey: string;
  /** The pinned model version, such as `jev-1.14.0`. */
  model: string;
  /** The client's decision request (untrusted JSON). */
  request: unknown;
  /**
   * When given, questions are compiled from this schema and the client's are
   * ignored. An invalid schema rejects with the core `DecisionSchemaError`
   * unchanged (a server programming error), not with a `DecisionError`.
   */
  schema?: DecidableSchema;
  /** Defaults to `https://api.typesafe.ai`. Use `https://ai-gateway.vercel.sh/typesafe` for the Gateway. */
  baseURL?: string;
  /** Aborts the call; an aborted call rejects with the signal's reason. */
  signal?: AbortSignal;
  /**
   * Edits the native request body just before it is sent. Anything it throws
   * propagates unchanged.
   */
  transformRequest?: (body: NativeRequest) => NativeRequest;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /**
   * The largest request accepted, in characters of JSON. Defaults to 256,000
   * (about Jev's 64k-token limit), or 1,048,000 when the request sets
   * `options.longContext` (about its 262k-token long-context limit). Set it
   * lower to bound what a public endpoint will forward.
   */
  maxRequestChars?: number;
}

function invalid(message: string): DecisionError {
  return new DecisionError('invalid_request', 400, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateQuestion(id: string, question: unknown): Decision.Question {
  if (!isRecord(question) || typeof question['instructions'] !== 'string') {
    throw invalid(`Question "${id}" must have string instructions`);
  }
  switch (question['type']) {
    case 'yesNo':
      return question as Decision.Question;
    case 'choice': {
      const options = question['options'];
      if (!isRecord(options)) throw invalid(`Question "${id}" needs options`);
      const count = Object.keys(options).length;
      if (count < 1 || count > MAX_OPTIONS) {
        throw invalid(`Question "${id}" needs 1 to ${MAX_OPTIONS} options`);
      }
      for (const description of Object.values(options)) {
        if (description !== null && typeof description !== 'string') {
          throw invalid(`Question "${id}" has a non-string option description`);
        }
      }
      return question as Decision.Question;
    }
    case 'score': {
      const levels = question['levels'];
      if (!isRecord(levels)) throw invalid(`Question "${id}" needs levels`);
      const keys = Object.keys(levels);
      if (keys.length < MIN_LEVELS || keys.length > MAX_LEVELS) {
        throw invalid(
          `Question "${id}" needs ${MIN_LEVELS} to ${MAX_LEVELS} levels`,
        );
      }
      for (const key of keys) {
        if (key.trim() === '' || !Number.isFinite(Number(key))) {
          throw invalid(`Question "${id}" has a non-numeric level "${key}"`);
        }
        if (typeof levels[key] !== 'string') {
          throw invalid(`Question "${id}" has a non-string level description`);
        }
      }
      return question as Decision.Question;
    }
    default:
      throw invalid(`Question "${id}" has an unknown type`);
  }
}

function validateRequest(
  raw: unknown,
  schema: DecidableSchema | undefined,
  maxRequestChars: number | undefined,
): Decision.Request {
  if (!isRecord(raw) || !('state' in raw) || raw['state'] === undefined) {
    throw invalid('The request must be an object with a state');
  }
  const { state } = raw;
  if (
    typeof state !== 'string' &&
    typeof state !== 'object' &&
    state !== null
  ) {
    // numbers and booleans are valid JSON too
    if (typeof state !== 'number' && typeof state !== 'boolean') {
      throw invalid('The request state must be a string or JSON');
    }
  }

  const longContext = isRecord(raw['options'])
    ? raw['options']['longContext']
    : undefined;
  if (raw['options'] !== undefined && !isRecord(raw['options'])) {
    throw invalid('options must be an object');
  }
  if (longContext !== undefined && typeof longContext !== 'boolean') {
    throw invalid('options.longContext must be a boolean');
  }
  const options = longContext === undefined ? {} : { options: { longContext } };

  const limit =
    maxRequestChars ??
    (longContext === true
      ? MAX_LONG_CONTEXT_REQUEST_CHARACTERS
      : MAX_REQUEST_CHARACTERS);
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    throw invalid('The request must be JSON-serializable');
  }
  if (size > limit) {
    throw invalid(`The request exceeds ${limit} characters of JSON`);
  }

  if (schema) {
    // The schema is server code: a DecisionSchemaError here is a programming
    // error, so it propagates unchanged and never reaches the client as a 400.
    const questions = ɵcompileDecision(schema);
    return { state: state as Decision.JsonValue, questions, ...options };
  }

  const questions = raw['questions'];
  if (!isRecord(questions))
    throw invalid('The request needs a questions object');
  const checked: Record<string, Decision.Question> = {};
  for (const [id, question] of Object.entries(questions)) {
    checked[id] = validateQuestion(id, question);
  }
  return { state: state as Decision.JsonValue, questions: checked, ...options };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Describes a failed response with the vendor's own error type and message,
 * so a 403 for missing billing does not read like a bad key. Reads TypeSafe's
 * `{ detail: { error_type } }` and `{ message, error_type }`, AI Gateway's
 * `{ error: { message, type } }`, or a plain-text body.
 */
async function errorMessage(response: globalThis.Response): Promise<string> {
  const prefix = `TypeSafe responded with status ${response.status}`;
  let text: string;
  try {
    text = (await response.text()).trim();
  } catch {
    return prefix;
  }
  if (text === '') return prefix;
  let type: unknown;
  let detail: unknown = text;
  try {
    const body: unknown = JSON.parse(text);
    const error = !isRecord(body)
      ? body
      : isRecord(body['error'])
        ? body['error']
        : isRecord(body['detail'])
          ? body['detail']
          : body;
    if (isRecord(error)) {
      detail = error['message'];
      type = error['error_type'] ?? error['type'];
    }
  } catch {
    // Not JSON: keep the text.
  }
  const kind = typeof type === 'string' && type !== '' ? ` (${type})` : '';
  const said =
    typeof detail === 'string' && detail !== ''
      ? `: ${detail.slice(0, MAX_ERROR_DETAIL)}`
      : '';
  return `${prefix}${kind}${said}`;
}

async function post(
  doFetch: typeof fetch,
  url: string,
  apiKey: string,
  body: NativeRequest,
  longContext: boolean,
  signal?: AbortSignal,
): Promise<globalThis.Response> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response: globalThis.Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(longContext ? { [LONG_CONTEXT_HEADER]: 'true' } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new DecisionError(
        'upstream',
        502,
        'The TypeSafe request failed',
        error,
      );
    }
    const retryable = response.status === 429 || response.status === 529;
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      await response.body?.cancel().catch(() => undefined);
      await sleep(RETRY_DELAYS_MS[attempt], signal);
      continue;
    }
    return response;
  }
}

/**
 * Server-side entry point for answering Hashbrown decisions with TypeSafe's
 * Jev model.
 *
 * @public
 */
export const HashbrownTypeSafe: {
  /**
   * Validates a decision request, sends it to TypeSafe and maps the answer.
   *
   * Retries HTTP 429 and 529 up to twice. Rejects with {@link DecisionError}
   * for every failure of the client request, TypeSafe, or the network. Three
   * cases reject with something else: an aborted `signal` rejects with the
   * signal's reason, and server programming errors propagate unchanged: a
   * `DecisionSchemaError` from an invalid `schema`, and anything thrown by
   * `transformRequest`. Treat those as HTTP 500 and do not send their details
   * to clients.
   *
   * For HTTP errors, the message includes the status and the vendor's error
   * type and message (for example the Gateway's
   * `customer_verification_required`), never the API key.
   *
   * Requests over `maxRequestChars` (default 256,000 characters of JSON) are
   * rejected before any network call. `request.options.longContext: true`
   * raises the default to 1,048,000 and sends TypeSafe's
   * `TypeSafe-Danger-Zone-Long-Context: true` header, which raises the context
   * limits to 262k tokens (slower and less accurate).
   *
   * @param options - The call options.
   * @returns The vendor-neutral decision response.
   */
  readonly decide: (
    options: TypeSafeDecideOptions,
  ) => Promise<Decision.Response>;
} = {
  async decide(options) {
    const request = validateRequest(
      options.request,
      options.schema,
      options.maxRequestChars,
    );
    const native = (options.transformRequest ?? ((body) => body))(
      toNativeRequest(request, options.model),
    );
    const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const doFetch = options.fetch ?? fetch;

    const response = await post(
      doFetch,
      `${baseURL}/v1/systemone`,
      options.apiKey,
      native,
      request.options?.longContext === true,
      options.signal,
    );

    if (!response.ok) {
      const message = await errorMessage(response);
      const code =
        response.status === 401 || response.status === 403
          ? 'unauthorized'
          : response.status === 429 || response.status === 529
            ? 'rate_limited'
            : 'upstream';
      throw new DecisionError(code, response.status, message);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      throw new DecisionError(
        'invalid_response',
        502,
        'TypeSafe returned a body that is not JSON',
        error,
      );
    }
    if (!isRecord(body) || !isRecord(body['answers'])) {
      throw new DecisionError(
        'invalid_response',
        502,
        'TypeSafe returned an unexpected body',
      );
    }

    try {
      return fromNativeResponse(body as NativeResponse, request.questions);
    } catch (error) {
      throw new DecisionError(
        'invalid_response',
        502,
        error instanceof Error
          ? error.message
          : 'TypeSafe returned an unexpected answer',
        error,
      );
    }
  },
};
