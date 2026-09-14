import type { Message } from '@ag-ui/core';
import type { Chat } from '../models';
import type { s } from '../schema';
import type { TransportOrFactory } from '../transport';
import type { JsonValue } from '../utils';

/** Owned initial resume input captured synchronously before scheduling. @internal */
export interface ResumeCheckpoint {
  readonly messages: readonly Readonly<Message>[];
  readonly state: JsonValue | undefined;
  readonly responseSchema: s.HashbrownType | undefined;
  readonly debounce: number;
  readonly retries: number;
  readonly internalTools: Chat.Internal.Tool[];
  readonly toolsByName: Record<string, Chat.Internal.Tool>;
  readonly uiRequested: boolean;
  readonly transportProvider: TransportOrFactory | undefined;
}
