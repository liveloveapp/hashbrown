import { Chat } from '../models';

/**
 * @public
 */
export interface ErrorFrame {
  type: 'error';
  error: string;
  stacktrace?: string;
}

/**
 * @public
 */
export interface ChunkFrame {
  type: 'chunk';
  chunk: Chat.Api.CompletionChunk;
}

/**
 * @public
 */
export interface FinishFrame {
  type: 'finish';
}

/**
 * @public
 */
export type Frame = ErrorFrame | ChunkFrame | FinishFrame;
