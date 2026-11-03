import type { Message, Tool } from '@ag-ui/core';
import type { JsonValue } from '../utils/types';
import type { Interrupt, ResumeEntry } from './interrupt';

/**
 * Server capability for explicitly settling unresolved browser calls after recovery.
 *
 * @public
 */
export interface PendingBrowserRecovery {
  /** Supported browser recovery capability version. */
  readonly protocolVersion: 1;
  /** Positive server revision captured by the authoritative recovery lookup. */
  readonly serverRevision: number;
  /** Every unresolved browser call, identified by its original canonical ID. */
  readonly callIds: readonly string[];
}

/**
 * Inert browser recovery batch owned by the current local restoration epoch.
 *
 * @public
 */
export interface PendingConversationRecovery {
  /** Fresh local restoration token; never a server ownership token. */
  readonly id: string;
  /** Server revision required for the explicit continuation. */
  readonly serverRevision: number;
  /** Original browser calls derived from validated canonical history. */
  readonly toolCalls: readonly Readonly<{
    /** Original canonical browser call identity. */
    id: string;
    /** Registered browser tool name. */
    name: string;
    /** Owned JSON arguments, without an executable handler. */
    arguments: Readonly<Record<string, JsonValue>>;
  }>[];
  /** Genuine protected decisions required alongside all browser outcomes. */
  readonly interrupts: readonly Interrupt[];
}

/**
 * Explicit application observation for one recovered browser call.
 *
 * An unavailable result does not establish whether its external effect occurred.
 *
 * @public
 */
export type BrowserRecoveryOutcome =
  | {
      /** Original browser call being settled. */
      readonly toolCallId: string;
      /** Supply the result already known by the application. */
      readonly status: 'result';
      /** Known JSON result; strings retain their exact content. */
      readonly value: JsonValue;
    }
  | {
      /** Original browser call being settled. */
      readonly toolCallId: string;
      /** Explicitly acknowledge that the original result is unavailable. */
      readonly status: 'unavailable';
    };

/**
 * Complete browser outcomes and protected decisions for one local recovery batch.
 *
 * @public
 */
export interface ResumeConversationRecoveryOptions {
  /** Current local pending recovery token. */
  readonly batchId: string;
  /** Exactly one explicit observation for every pending browser call. */
  readonly outcomes: readonly BrowserRecoveryOutcome[];
  /** Every genuine protected decision; absent or empty for browser-only batches. */
  readonly entries?: readonly ResumeEntry[];
}

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
  /** Negotiated capability for inert explicit settlement of pending browser calls. */
  readonly pendingBrowserRecovery?: PendingBrowserRecovery;
}

/** Options for atomically restoring retained native history. @public */
export interface ConversationRestoreOptions {
  /** Local revision captured before the recovery lookup. */
  readonly expectedRevision: number;
  /** Explicitly retain schema-invalid assistant text as historical diagnostics. Defaults to strict. */
  readonly structuredHistory?: 'strict' | 'preserve-diagnostics';
}

/**
 * Canonical recovery observations for display as ordinary escaped text.
 *
 * Diagnostics do not grant cancellation or execution authority.
 *
 * @public
 */
export type ConversationRecoveryDiagnostic =
  | {
      /** Historical assistant text did not satisfy the configured response schema. */
      readonly kind: 'unstructured-assistant-history';
      /** Canonical thread containing the historical record. */
      readonly threadId: string;
      /** Canonical identity of the historical record. */
      readonly messageId: string;
      /** Exact historical text; render as ordinary escaped text. */
      readonly content: string;
    }
  | {
      /** The exact reserved browser result marker records an unknown external effect. */
      readonly kind: 'browser-result-unavailable';
      /** Canonical thread containing the browser result. */
      readonly threadId: string;
      /** Canonical identity of the browser result message. */
      readonly messageId: string;
      /** Original browser call associated with the canonical result. */
      readonly toolCallId: string;
      /** Exact reserved content; render as ordinary escaped text without retry authority. */
      readonly content: string;
    };

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
