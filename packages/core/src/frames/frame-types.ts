import { Chat } from '../models';

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
export type ResponseOutputItem = Record<string, unknown>;

/**
 * Generic Open Responses content part payload.
 *
 * @public
 */
export type ResponseContentPart = Record<string, unknown>;

/**
 * Generic Open Responses annotation payload.
 *
 * @public
 */
export type ResponseAnnotation = Record<string, unknown>;

/**
 * Generic Open Responses log probability payload.
 *
 * @public
 */
export type ResponseLogProb = Record<string, unknown>;

/**
 * @public
 */
export interface GenerationStartFrame {
  type: 'generation-start';
}

/**
 * @public
 */
export interface GenerationErrorFrame {
  type: 'generation-error';
  error: string;
  stacktrace?: string;
}

/**
 * @public
 */
export interface GenerationChunkFrame {
  type: 'generation-chunk';
  chunk: Chat.Api.CompletionChunk;
}

/**
 * @public
 */
export interface GenerationFinishFrame {
  type: 'generation-finish';
}

/**
 * @public
 */
export type Frame =
  | GenerationStartFrame
  | GenerationErrorFrame
  | GenerationChunkFrame
  | GenerationFinishFrame
  | ResponseCreatedFrame
  | ResponseQueuedFrame
  | ResponseInProgressFrame
  | ResponseCompletedFrame
  | ResponseFailedFrame
  | ResponseIncompleteFrame
  | ResponseOutputItemAddedFrame
  | ResponseOutputItemDoneFrame
  | ResponseContentPartAddedFrame
  | ResponseContentPartDoneFrame
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

/**
 * @public
 */
export interface BaseResponseFrame {
  type: string;
  sequenceNumber?: number;
}

/**
 * @public
 */
export interface ResponseCreatedFrame extends BaseResponseFrame {
  type: 'response.created';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseQueuedFrame extends BaseResponseFrame {
  type: 'response.queued';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseInProgressFrame extends BaseResponseFrame {
  type: 'response.in_progress';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseCompletedFrame extends BaseResponseFrame {
  type: 'response.completed';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseFailedFrame extends BaseResponseFrame {
  type: 'response.failed';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseIncompleteFrame extends BaseResponseFrame {
  type: 'response.incomplete';
  response: ResponseResource;
}

/**
 * @public
 */
export interface ResponseOutputItemAddedFrame extends BaseResponseFrame {
  type: 'response.output_item.added';
  outputIndex: number;
  item: ResponseOutputItem | null;
}

/**
 * @public
 */
export interface ResponseOutputItemDoneFrame extends BaseResponseFrame {
  type: 'response.output_item.done';
  outputIndex: number;
  item: ResponseOutputItem | null;
}

/**
 * @public
 */
export interface ResponseContentPartAddedFrame extends BaseResponseFrame {
  type: 'response.content_part.added';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  part: ResponseContentPart;
}

/**
 * @public
 */
export interface ResponseContentPartDoneFrame extends BaseResponseFrame {
  type: 'response.content_part.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  part: ResponseContentPart;
}

/**
 * @public
 */
export interface ResponseOutputTextDeltaFrame extends BaseResponseFrame {
  type: 'response.output_text.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  logprobs?: ResponseLogProb[];
  obfuscation?: string;
}

/**
 * @public
 */
export interface ResponseOutputTextDoneFrame extends BaseResponseFrame {
  type: 'response.output_text.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
  logprobs?: ResponseLogProb[];
}

/**
 * @public
 */
export interface ResponseRefusalDeltaFrame extends BaseResponseFrame {
  type: 'response.refusal.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
}

/**
 * @public
 */
export interface ResponseRefusalDoneFrame extends BaseResponseFrame {
  type: 'response.refusal.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  refusal: string;
}

/**
 * @public
 */
export interface ResponseReasoningDeltaFrame extends BaseResponseFrame {
  type: 'response.reasoning.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  obfuscation?: string;
}

/**
 * @public
 */
export interface ResponseReasoningDoneFrame extends BaseResponseFrame {
  type: 'response.reasoning.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
}

/**
 * @public
 */
export interface ResponseReasoningSummaryDeltaFrame extends BaseResponseFrame {
  type: 'response.reasoning_summary_text.delta';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  delta: string;
  obfuscation?: string;
}

/**
 * @public
 */
export interface ResponseReasoningSummaryDoneFrame extends BaseResponseFrame {
  type: 'response.reasoning_summary_text.done';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  text: string;
}

/**
 * @public
 */
export interface ResponseOutputTextAnnotationAddedFrame extends BaseResponseFrame {
  type: 'response.output_text.annotation.added';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  annotationIndex: number;
  annotation: ResponseAnnotation | null;
}

/**
 * @public
 */
export interface ResponseFunctionCallArgumentsDeltaFrame extends BaseResponseFrame {
  type: 'response.function_call_arguments.delta';
  itemId: string;
  outputIndex: number;
  delta: string;
  obfuscation?: string;
}

/**
 * @public
 */
export interface ResponseFunctionCallArgumentsDoneFrame extends BaseResponseFrame {
  type: 'response.function_call_arguments.done';
  itemId: string;
  outputIndex: number;
  arguments: string;
}

/**
 * @public
 */
export interface ErrorFrame extends BaseResponseFrame {
  type: 'error';
  error: {
    type: string;
    code?: string | null;
    message: string;
    param?: string | null;
    headers?: Record<string, string>;
  };
}
