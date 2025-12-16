import { Chat } from '../models';

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
export interface ThreadLoadStartFrame {
  type: 'thread-load-start';
}

/**
 * @public
 */
export interface ThreadLoadSuccessFrame {
  type: 'thread-load-success';
  thread?: Chat.Api.Message[];
}

/**
 * @public
 */
export interface ThreadLoadFailureFrame {
  type: 'thread-load-failure';
  error: string;
  stacktrace?: string;
}

/**
 * @public
 */
export interface ThreadSaveStartFrame {
  type: 'thread-save-start';
}

/**
 * @public
 */
export interface ThreadSaveSuccessFrame {
  type: 'thread-save-success';
  threadId: string;
}

/**
 * @public
 */
export interface ThreadSaveFailureFrame {
  type: 'thread-save-failure';
  error: string;
  stacktrace?: string;
}

/**
 * @public
 */
export type Frame =
  | GenerationStartFrame
  | ThreadLoadStartFrame
  | ThreadLoadSuccessFrame
  | ThreadLoadFailureFrame
  | ThreadSaveStartFrame
  | ThreadSaveSuccessFrame
  | ThreadSaveFailureFrame
  | GenerationErrorFrame
  | GenerationChunkFrame
  | GenerationFinishFrame;
