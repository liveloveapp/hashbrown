import type { SseEvent } from './sse';

/**
 * Generic Open Responses resource payload.
 *
 * @public
 */
export type ResponseResource = Record<string, unknown>;

/**
 * Generic Open Responses output item payload.
 *
 * @public
 */
export type ItemField = Record<string, unknown>;

/**
 * Generic Open Responses content part payload.
 *
 * @public
 */
export type ContentPart = Record<string, unknown>;

/**
 * Generic Open Responses annotation payload.
 *
 * @public
 */
export type Annotation = Record<string, unknown>;

/**
 * Generic Open Responses log probability payload.
 *
 * @public
 */
export type LogProb = Record<string, unknown>;

/**
 * Base Open Responses frame shape.
 *
 * @public
 */
export type BaseResponseFrame = {
  type: string;
  sequenceNumber?: number;
};

/**
 * Open Responses response lifecycle frame.
 *
 * @public
 */
export type ResponseLifecycleFrame = BaseResponseFrame & {
  response: ResponseResource;
};

/**
 * Open Responses output item frame.
 *
 * @public
 */
export type ResponseOutputItemFrame = BaseResponseFrame & {
  outputIndex: number;
  item: ItemField | null;
};

/**
 * Open Responses content part frame.
 *
 * @public
 */
export type ResponseContentPartFrame = BaseResponseFrame & {
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  part: ContentPart;
};

/**
 * Open Responses output text delta frame.
 *
 * @public
 */
export type ResponseOutputTextDeltaFrame = BaseResponseFrame & {
  type: 'response.output_text.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  logprobs?: LogProb[];
  obfuscation?: string;
};

/**
 * Open Responses output text done frame.
 *
 * @public
 */
export type ResponseOutputTextDoneFrame = BaseResponseFrame & {
  type: 'response.output_text.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
  logprobs?: LogProb[];
};

/**
 * Open Responses refusal delta frame.
 *
 * @public
 */
export type ResponseRefusalDeltaFrame = BaseResponseFrame & {
  type: 'response.refusal.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
};

/**
 * Open Responses refusal done frame.
 *
 * @public
 */
export type ResponseRefusalDoneFrame = BaseResponseFrame & {
  type: 'response.refusal.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  refusal: string;
};

/**
 * Open Responses reasoning delta frame.
 *
 * @public
 */
export type ResponseReasoningDeltaFrame = BaseResponseFrame & {
  type: 'response.reasoning.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  obfuscation?: string;
};

/**
 * Open Responses reasoning done frame.
 *
 * @public
 */
export type ResponseReasoningDoneFrame = BaseResponseFrame & {
  type: 'response.reasoning.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
};

/**
 * Open Responses reasoning summary delta frame.
 *
 * @public
 */
export type ResponseReasoningSummaryDeltaFrame = BaseResponseFrame & {
  type: 'response.reasoning_summary_text.delta';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  delta: string;
  obfuscation?: string;
};

/**
 * Open Responses reasoning summary done frame.
 *
 * @public
 */
export type ResponseReasoningSummaryDoneFrame = BaseResponseFrame & {
  type: 'response.reasoning_summary_text.done';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  text: string;
};

/**
 * Open Responses output text annotation frame.
 *
 * @public
 */
export type ResponseOutputTextAnnotationAddedFrame = BaseResponseFrame & {
  type: 'response.output_text.annotation.added';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  annotationIndex: number;
  annotation: Annotation | null;
};

/**
 * Open Responses function call arguments delta frame.
 *
 * @public
 */
export type ResponseFunctionCallArgumentsDeltaFrame = BaseResponseFrame & {
  type: 'response.function_call_arguments.delta';
  itemId: string;
  outputIndex: number;
  delta: string;
  obfuscation?: string;
};

/**
 * Open Responses function call arguments done frame.
 *
 * @public
 */
export type ResponseFunctionCallArgumentsDoneFrame = BaseResponseFrame & {
  type: 'response.function_call_arguments.done';
  itemId: string;
  outputIndex: number;
  arguments: string;
};

/**
 * Open Responses error frame.
 *
 * @public
 */
export type ErrorFrame = BaseResponseFrame & {
  type: 'error';
  error: {
    type: string;
    code?: string | null;
    message: string;
    param?: string | null;
    headers?: Record<string, string>;
  };
};

/**
 * Open Responses aligned frame union.
 *
 * @public
 */
export type ResponseFrame =
  | ResponseLifecycleFrame
  | ResponseOutputItemFrame
  | ResponseContentPartFrame
  | ResponseOutputTextDeltaFrame
  | ResponseOutputTextDoneFrame
  | ResponseRefusalDeltaFrame
  | ResponseRefusalDoneFrame
  | ResponseReasoningDeltaFrame
  | ResponseReasoningDoneFrame
  | ResponseReasoningSummaryDeltaFrame
  | ResponseReasoningSummaryDoneFrame
  | ResponseOutputTextAnnotationAddedFrame
  | ResponseFunctionCallArgumentsDeltaFrame
  | ResponseFunctionCallArgumentsDoneFrame
  | ErrorFrame;

const responseLifecycleTypes = new Set<string>([
  'response.created',
  'response.queued',
  'response.in_progress',
  'response.completed',
  'response.failed',
  'response.incomplete',
]);

/**
 * Map a parsed SSE event into an Open Responses-aligned frame.
 *
 * @public
 * @param event - Parsed SSE event.
 * @returns Open Responses frame or null when no frame should be emitted.
 */
export function mapSseEventToFrame(event: SseEvent): ResponseFrame | null {
  if (event.data === '[DONE]') {
    return null;
  }

  const parsed = parseEventData(event.data);
  if (!parsed.ok) {
    return parsed.errorFrame;
  }

  const payload = parsed.value;
  const eventType = resolveEventType(event.event, payload);
  if (!eventType) {
    return buildErrorFrame('unsupported_event', 'Missing event type.');
  }

  const sequenceNumber = readNumber(
    payload,
    'sequence_number',
    'sequenceNumber',
  );
  if (responseLifecycleTypes.has(eventType)) {
    const response = readObject(payload, 'response');
    if (!response) {
      return buildErrorFrame(
        'invalid_event',
        `Missing response payload for ${eventType}.`,
        sequenceNumber,
      );
    }

    return {
      type: eventType,
      response,
      sequenceNumber: sequenceNumber ?? undefined,
    };
  }

  switch (eventType) {
    case 'response.output_item.added':
    case 'response.output_item.done': {
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      if (outputIndex === undefined) {
        return buildErrorFrame(
          'invalid_event',
          `Missing output_index for ${eventType}.`,
          sequenceNumber,
        );
      }

      const item = readNullableObject(payload, 'item');

      return {
        type: eventType,
        outputIndex,
        item,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.content_part.added':
    case 'response.content_part.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const part = readObject(payload, 'part');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !part
      ) {
        return buildErrorFrame(
          'invalid_event',
          `Missing required fields for ${eventType}.`,
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        part,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.output_text.delta': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const delta = readString(payload, 'delta');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !delta
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.output_text.delta.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        delta,
        logprobs: readLogProbs(payload),
        obfuscation: readString(payload, 'obfuscation'),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.output_text.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const text = readString(payload, 'text');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !text
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.output_text.done.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        text,
        logprobs: readLogProbs(payload),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.refusal.delta': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const delta = readString(payload, 'delta');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !delta
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.refusal.delta.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        delta,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.refusal.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const refusal = readString(payload, 'refusal');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !refusal
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.refusal.done.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        refusal,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.reasoning.delta': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const delta = readString(payload, 'delta');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !delta
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.reasoning.delta.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        delta,
        obfuscation: readString(payload, 'obfuscation'),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.reasoning.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const text = readString(payload, 'text');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        !text
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.reasoning.done.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        text,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.reasoning_summary_text.delta': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const summaryIndex = readNumber(payload, 'summary_index', 'summaryIndex');
      const delta = readString(payload, 'delta');

      if (
        !itemId ||
        outputIndex === undefined ||
        summaryIndex === undefined ||
        !delta
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.reasoning_summary_text.delta.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        summaryIndex,
        delta,
        obfuscation: readString(payload, 'obfuscation'),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.reasoning_summary_text.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const summaryIndex = readNumber(payload, 'summary_index', 'summaryIndex');
      const text = readString(payload, 'text');

      if (
        !itemId ||
        outputIndex === undefined ||
        summaryIndex === undefined ||
        !text
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.reasoning_summary_text.done.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        summaryIndex,
        text,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.output_text.annotation.added': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const contentIndex = readNumber(payload, 'content_index', 'contentIndex');
      const annotationIndex = readNumber(
        payload,
        'annotation_index',
        'annotationIndex',
      );
      const annotation = readNullableObject(payload, 'annotation');

      if (
        !itemId ||
        outputIndex === undefined ||
        contentIndex === undefined ||
        annotationIndex === undefined
      ) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.output_text.annotation.added.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        contentIndex,
        annotationIndex,
        annotation,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.function_call_arguments.delta': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const delta = readString(payload, 'delta');

      if (!itemId || outputIndex === undefined || !delta) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.function_call_arguments.delta.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        delta,
        obfuscation: readString(payload, 'obfuscation'),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'response.function_call_arguments.done': {
      const itemId = readString(payload, 'item_id', 'itemId');
      const outputIndex = readNumber(payload, 'output_index', 'outputIndex');
      const args = readString(payload, 'arguments');

      if (!itemId || outputIndex === undefined || !args) {
        return buildErrorFrame(
          'invalid_event',
          'Missing required fields for response.function_call_arguments.done.',
          sequenceNumber,
        );
      }

      return {
        type: eventType,
        itemId,
        outputIndex,
        arguments: args,
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    case 'error': {
      const error = readObject(payload, 'error');
      if (!error) {
        return buildErrorFrame(
          'invalid_event',
          'Missing error payload for error event.',
          sequenceNumber,
        );
      }

      return {
        type: 'error',
        error: normalizeErrorShape(error),
        sequenceNumber: sequenceNumber ?? undefined,
      };
    }
    default:
      return buildErrorFrame(
        'unsupported_event',
        `Unsupported event type: ${eventType}.`,
        sequenceNumber,
      );
  }
}

type ParsedEventData =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errorFrame: ErrorFrame };

const parseEventData = (data: string): ParsedEventData => {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        errorFrame: buildErrorFrame(
          'invalid_json',
          'Event data must be a JSON object.',
        ),
      };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unable to parse JSON.';
    return {
      ok: false,
      errorFrame: buildErrorFrame('invalid_json', message),
    };
  }
};

const resolveEventType = (
  eventName: string | null,
  payload: Record<string, unknown>,
): string | null => {
  const payloadType = readString(payload, 'type');
  return payloadType ?? eventName;
};

const readString = (
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  const value = readValue(payload, keys);
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return undefined;
};

const readNumber = (
  payload: Record<string, unknown>,
  ...keys: string[]
): number | undefined => {
  const value = readValue(payload, keys);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const readObject = (
  payload: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null => {
  const value = readValue(payload, keys);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readNullableObject = (
  payload: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null => {
  const value = readValue(payload, keys);
  if (value === null) {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readLogProbs = (
  payload: Record<string, unknown>,
): LogProb[] | undefined => {
  const value = readValue(payload, ['logprobs']);
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value as LogProb[];
};

const readValue = (
  payload: Record<string, unknown>,
  keys: string[],
): unknown => {
  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key];
    }
  }

  return undefined;
};

const buildErrorFrame = (
  type: string,
  message: string,
  sequenceNumber?: number,
): ErrorFrame => ({
  type: 'error',
  error: {
    type,
    message,
  },
  sequenceNumber,
});

const normalizeErrorShape = (
  error: Record<string, unknown>,
): ErrorFrame['error'] => {
  const typeValue = error['type'];
  const codeValue = error['code'];
  const messageValue = error['message'];
  const paramValue = error['param'];
  const headersValue = error['headers'];

  return {
    type: typeof typeValue === 'string' ? typeValue : 'unknown_error',
    code: typeof codeValue === 'string' ? codeValue : null,
    message: typeof messageValue === 'string' ? messageValue : 'Unknown error.',
    param: typeof paramValue === 'string' ? paramValue : null,
    headers:
      typeof headersValue === 'object' && headersValue !== null
        ? (headersValue as Record<string, string>)
        : undefined,
  };
};
