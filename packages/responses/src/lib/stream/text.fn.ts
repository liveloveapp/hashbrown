import type { Chat } from '@hashbrownai/core';

import { mapSseEventToFrame, type ResponseFrame } from './frames';
import { mapChatRequestToOpenResponses } from './mapping';
import { parseSseStream } from './sse';
import type { OpenResponsesCreateResponseRequest } from './types';

/**
 * Options for streaming Open Responses text from a backend.
 *
 * @public
 */
export interface OpenResponsesTextStreamOptions {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: OpenResponsesCreateResponseRequest,
  ) =>
    | OpenResponsesCreateResponseRequest
    | Promise<OpenResponsesCreateResponseRequest>;
  fetchImpl?: typeof fetch;
}

const terminalEventTypes = new Set<string>([
  'response.completed',
  'response.failed',
  'response.incomplete',
]);

/**
 * Stream Open Responses SSE events as Hashbrown frames.
 *
 * @public
 * @param options - Stream configuration options.
 * @returns Async iterator of encoded response frames.
 */
export async function* text(
  options: OpenResponsesTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const {
    baseURL,
    apiKey,
    headers,
    request,
    transformRequestOptions,
    fetchImpl,
  } = options;

  if (!baseURL) {
    yield encodeFrame(buildErrorFrame('invalid_request', 'Missing baseURL.'));
    return;
  }

  const boundFetch =
    typeof fetch === 'function' ? fetch.bind(globalThis) : undefined;
  const resolvedFetch = fetchImpl ?? (boundFetch as typeof fetch);

  if (!resolvedFetch) {
    yield encodeFrame(
      buildErrorFrame('missing_fetch', 'No fetch implementation available.'),
    );
    return;
  }

  const mappedRequest = mapChatRequestToOpenResponses(request);
  const baseRequest: OpenResponsesCreateResponseRequest = {
    ...mappedRequest,
    stream: true,
  };

  const resolvedRequest = transformRequestOptions
    ? await transformRequestOptions(baseRequest)
    : baseRequest;

  let response: Response;
  try {
    response = await resolvedFetch(buildResponsesUrl(baseURL), {
      method: 'POST',
      headers: buildHeaders({ apiKey, headers }),
      body: JSON.stringify(resolvedRequest),
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error);
    yield encodeFrame(buildErrorFrame('network_error', message));
    return;
  }

  if (!response.ok) {
    const message = await readResponseMessage(response);
    yield encodeFrame(buildErrorFrame('http_error', message));
    return;
  }

  if (!response.body) {
    yield encodeFrame(
      buildErrorFrame('invalid_response', 'Response body is null.'),
    );
    return;
  }

  for await (const event of parseSseStream(response.body)) {
    const frame = mapSseEventToFrame(event);
    if (!frame) {
      continue;
    }

    yield encodeFrame(frame);

    if (terminalEventTypes.has(frame.type)) {
      return;
    }
  }
}

const buildResponsesUrl = (baseURL: string): string => {
  const trimmed = baseURL.replace(/\/+$/, '');
  return trimmed.endsWith('/v1/responses')
    ? trimmed
    : `${trimmed}/v1/responses`;
};

const buildHeaders = (options: {
  apiKey?: string;
  headers?: Record<string, string>;
}): Record<string, string> => {
  const { apiKey, headers } = options;
  return {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(headers ?? {}),
  };
};

const encodeFrame = (frame: ResponseFrame): Uint8Array => {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(frame));
  const out = new Uint8Array(4 + jsonBytes.length);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  view.setUint32(0, jsonBytes.length, false);
  out.set(jsonBytes, 4);

  return out;
};

const buildErrorFrame = (type: string, message: string): ResponseFrame => ({
  type: 'error',
  error: {
    type,
    message,
  },
});

const normalizeError = (error: unknown): { message: string } => {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
};

const readResponseMessage = async (response: Response): Promise<string> => {
  let bodyText: string | undefined;
  try {
    bodyText = await response.text();
  } catch {
    bodyText = undefined;
  }

  const trimmedBody =
    bodyText && bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText;
  const statusText = response.statusText || 'HTTP error';

  return trimmedBody
    ? `${statusText} (${response.status}): ${trimmedBody}`
    : `${statusText} (${response.status})`;
};
