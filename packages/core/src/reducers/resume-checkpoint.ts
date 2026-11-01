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
  /** The schema sent to the model, which may be narrower. */
  readonly requestResponseSchema: s.HashbrownType | undefined;
  readonly debounce: number;
  readonly retries: number;
  readonly internalTools: Chat.Internal.Tool[];
  readonly toolsByName: Record<string, Chat.Internal.Tool>;
  readonly uiRequested: boolean;
  readonly transportProvider: TransportOrFactory | undefined;
}

/** Exact immutable initial request for a claimed cold browser continuation. @internal */
export interface BrowserRecoveryCheckpoint extends ResumeCheckpoint {
  /** Genuine owned native decision batch; absent for browser-only recovery. */
  readonly nativeBatch?: import('../models/interrupt').PendingInterruptBatch;
  /** Fully serialized, capped and privately marked initial run input. */
  readonly request: import('../transport/hashbrown-run-agent-input').HashbrownRunAgentInput;
  /** Original canonical history followed by explicit browser results. */
  readonly canonicalMessages: readonly Readonly<Message>[];
}
