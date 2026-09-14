/**
 * A server request for a decision before its workflow can continue.
 *
 * @public
 */
export interface Interrupt {
  /** Server identifier used to correlate a resume decision. */
  readonly id: string;
  /** Reason for the pause, including server-defined extension values. */
  readonly reason: string;
  /** Optional description for display to the application user. */
  readonly message?: string;
  /** Original tool call associated with this interrupt, when supplied. */
  readonly toolCallId?: string;
  /** JSON schema preserved for application-owned response validation. */
  readonly responseSchema?: Readonly<Record<string, unknown>>;
  /** ISO timestamp at or after which the entire batch cannot be resumed. */
  readonly expiresAt?: string;
  /** Optional JSON-compatible server metadata, recursively owned at runtime. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Originating subagent run identifier, when supplied. */
  readonly subagentRunId?: string;
}

/**
 * A complete interrupt batch owned by the current live runtime.
 *
 * @public
 */
export interface PendingInterruptBatch {
  /** Local ownership token; saved tokens cannot restore a batch after reload. */
  readonly id: string;
  /** All interrupts that must be answered together. */
  readonly interrupts: readonly Interrupt[];
}

/**
 * An application decision for one interrupt.
 *
 * @public
 */
export interface ResumeEntry {
  /** Server interrupt identifier being answered. */
  readonly interruptId: string;
  /** Whether the application resolved or cancelled this interrupt. */
  readonly status: 'resolved' | 'cancelled';
  /** JSON-compatible answer for a resolved entry; omit for cancellation. Applications validate the response schema. */
  readonly payload?: unknown;
  /** Optional JSON-compatible response metadata, recursively owned at runtime. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Decisions for every interrupt in the identified pending batch.
 *
 * @public
 */
export interface ResumeOptions {
  /** Local identifier of the currently pending batch. */
  readonly batchId: string;
  /** Exactly one decision for each interrupt; ordering is independent. */
  readonly entries: readonly ResumeEntry[];
}
