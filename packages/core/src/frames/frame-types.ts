import { Chat } from '../models';

export interface ErrorFrame {
  type: 'error';
  error: string;
  stacktrace?: string;
}

export interface ChunkFrame {
  type: 'chunk';
  chunk: Chat.Api.CompletionChunk;
}

export interface FinishFrame {
  type: 'finish';
}

export type Frame = ErrorFrame | ChunkFrame | FinishFrame;
