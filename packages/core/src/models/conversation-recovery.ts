import type { Message, Tool } from '@ag-ui/core';
import type { Interrupt } from './interrupt';

/** Canonical retained conversation data, validated against trusted runtime configuration. @public */
export interface ConversationSnapshot<State = unknown> {
  /** Original nonempty AG-UI thread identity. */
  readonly threadId: string;
  /** Canonical native AG-UI history, including the original system overlay. */
  readonly messages: readonly Readonly<Message>[];
  /** JSON-compatible shared agent state. */
  readonly state?: State;
  /** Complete unexpired server interrupt batch, without a local batch token. */
  readonly interrupts?: readonly Interrupt[];
  /** Original first configured system message identity, when configured. */
  readonly configuredSystemMessageId?: string;
}

/** Local compare-and-swap revision and recovery-required disposition. @public */
export interface ConversationRecoveryState {
  /** Capture before an asynchronous lookup and pass back on restoration. */
  readonly revision: number;
  /** Whether an acknowledged failed interaction needs explicit recovery. */
  readonly required: boolean;
}

/** Trusted native request configuration for a read-only recovery lookup. @public */
export interface ConversationRecoveryConfiguration {
  /** Current trusted configured system instructions, when nonempty. */
  readonly system?: string;
  /** Native browser tool declarations in request order, without handlers. */
  readonly tools: readonly Readonly<Tool>[];
  /** Owned JSON request extensions, including the current response schema. */
  readonly forwardedProps: Readonly<Record<string, unknown>>;
}
