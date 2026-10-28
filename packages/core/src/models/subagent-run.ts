import { type JsonValue } from '../utils/types';

/**
 * Observed provenance and lifecycle of one native subagent invocation.
 * Attribution alone creates an unknown record; lifecycle fields are present
 * only when the producer supplies them.
 *
 * @public
 */
export interface SubagentRun {
  /** Opaque native invocation identifier, including an empty string. */
  readonly subagentRunId: string;
  /** Producer-supplied display name. */
  readonly name?: string;
  /** Producer-supplied description. */
  readonly description?: string;
  /** Parent invocation, when the producer declares nesting. */
  readonly parentSubagentRunId?: string;
  /** Tool call that initiated this invocation, when supplied. */
  readonly parentToolCallId?: string;
  /** Message that initiated this invocation, when supplied. */
  readonly parentMessageId?: string;
  /** Enclosing run observed at invocation start. */
  readonly runId?: string;
  /** Lifecycle observed from native events; unknown never implies completion. */
  readonly status:
    'unknown' | 'running' | 'awaiting' | 'complete' | 'failed' | 'cancelled';
  /** Owned, deeply frozen JSON result supplied by the producer. */
  readonly result?: Readonly<JsonValue>;
  /** Invocation-local failure; it does not imply an enclosing run failure. */
  readonly error?: { readonly message: string; readonly code?: string };
  /** Finite producer timestamps only; either endpoint can be unknown. */
  readonly timing?: {
    readonly startedAt?: number;
    readonly settledAt?: number;
  };
  /** Interrupts explicitly associated with a suspended invocation. */
  readonly interruptIds?: readonly string[];
}
