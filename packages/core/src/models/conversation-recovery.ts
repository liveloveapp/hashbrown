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

/** Options for atomically restoring retained native history. @public */
export interface ConversationRestoreOptions {
  /** Local revision captured before the recovery lookup. */
  readonly expectedRevision: number;
  /** Explicitly retain schema-invalid assistant text as historical diagnostics. Defaults to strict. */
  readonly structuredHistory?: 'strict' | 'preserve-diagnostics';
}

/** Plain text excluded from typed/UI projection, without cancellation authority. @public */
export interface ConversationRecoveryDiagnostic {
  /** Historical assistant text did not satisfy the configured response schema. */
  readonly kind: 'unstructured-assistant-history';
  /** Canonical thread containing the historical record. */
  readonly threadId: string;
  /** Canonical identity of the historical record. */
  readonly messageId: string;
  /** Exact historical text; applications must render it as ordinary escaped text. */
  readonly content: string;
}

/** Local compare-and-swap revision and recovery-required disposition. @public */
export interface ConversationRecoveryState {
  /** Capture before an asynchronous lookup and pass back on restoration. */
  readonly revision: number;
  /** Whether an acknowledged failed interaction needs explicit recovery. */
  readonly required: boolean;
  /** Current immutable diagnostics, in canonical history order; absent when empty. */
  readonly diagnostics?: readonly ConversationRecoveryDiagnostic[];
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
