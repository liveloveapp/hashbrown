import { Resource, Signal } from '@angular/core';
import {
  Chat,
  type ConversationRecoveryConfiguration,
  type ConversationRecoveryState,
  type ConversationRestoreOptions,
  type ConversationSnapshot,
  type FinishReason,
  type JsonValue,
  type PendingConversationRecovery,
  type PendingInterruptBatch,
  type ResumeConversationRecoveryOptions,
  type ResumeOptions,
  s,
  type TokenUsage,
  type TransportOrFactory,
} from '@hashbrownai/core';
import { ReactiveOption } from '../utils/types';
import { structuredCompletionResourceWithMessage } from './structured-completion-resource-with-message.fn';

/**
 * A reference to the structured completion resource.
 *
 * @public
 * @typeParam Output - The structured completion output.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface StructuredCompletionResourceRef<
  Output,
  State = unknown,
> extends Resource<Output | null> {
  /** The current interrupt batch, retained until resume is acknowledged. */
  readonly pendingInterrupts: Signal<PendingInterruptBatch | undefined>;
  /** Whether the whole resumed interaction is executing. */
  readonly isResuming: Signal<boolean>;
  /** Submits a complete response batch for the current interruption. */
  resume(options: ResumeOptions): void;

  /** The inert browser recovery batch awaiting explicit settlement. */
  readonly pendingConversationRecovery: Signal<
    PendingConversationRecovery | undefined
  >;

  /**
   * Explicitly settle every recovered browser call and protected decision.
   * @param options - The complete outcomes and decisions for the current recovery batch.
   */
  resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;

  /** The local recovery revision and whether an explicit restore is required. */
  readonly recovery: Signal<ConversationRecoveryState>;

  /** Read owned trusted request configuration for an authenticated recovery lookup. */
  getRecoveryConfiguration(): ConversationRecoveryConfiguration;

  /**
   * Atomically restore idle conversation history without scheduling work.
   * @param snapshot - The canonical history and optional shared state and interrupts.
   * @param options - The local revision captured before the recovery lookup.
   */
  restoreConversation(
    snapshot: ConversationSnapshot<State>,
    options: ConversationRestoreOptions,
  ): void;
  /** The currently visible shared agent state. */
  readonly state: Signal<State | undefined>;
  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;
  /**
   * Indicates whether the underlying completion call is currently sending a message.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the completion is generating assistant output.
   */
  isGenerating: Signal<boolean>;
  /**
   * Indicates whether the underlying completion call is currently receiving tokens.
   */
  isReceiving: Signal<boolean>;
  /** Indicates whether tool calls are running. */
  isRunningToolCalls: Signal<boolean>;
  /** Aggregate loading flag across transport, generation, and tool calls. */
  isLoading: Signal<boolean>;
  /** Transport/request error before generation events arrive. */
  sendingError: Signal<Error | undefined>;
  /** Error emitted during generation events. */
  generatingError: Signal<Error | undefined>;
  /**
   * The return value the agent attached to the last run that completed
   * (AG-UI's `RUN_FINISHED.result`), or `undefined` when it attached none.
   * Cleared when the next run starts. Interrupted, cancelled, and failed
   * runs never set it.
   */
  lastRunResult: Signal<JsonValue | undefined>;

  /**
   * The token usage of the last run that completed (AG-UI's
   * `RUN_FINISHED.usage`), one entry per provider and model, or `undefined`
   * when the server reported none. Cleared when the next run starts, so a turn
   * that calls tools reports only its final run.
   */
  lastRunUsage: Signal<readonly TokenUsage[] | undefined>;

  /**
   * Why the model stopped in the last run that completed, such as `length`
   * when the answer was cut off by a token limit, or `undefined` when the
   * server did not say. Cleared when the next run starts.
   */
  lastRunFinishReason: Signal<FinishReason | undefined>;
  /**
   * Reloads the resource.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Stops any currently-streaming message.
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
}

/**
 * Options for the structured completion resource.
 *
 * @public
 * @typeParam Input - The type of completion input.
 * @typeParam Schema - The schema that defines completion output.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface StructuredCompletionResourceOptions<
  Input,
  Schema extends s.SchemaOutput,
  State = unknown,
> {
  /**
   * The input to the structured completion resource.
   */
  input: Signal<Input | null | undefined>;
  /**
   * The schema to use for the structured completion resource.
   */
  schema: Schema;
  /**
   * The system prompt to use for the structured completion resource.
   */
  system: ReactiveOption<string>;
  /** The initial shared agent state. */
  state?: State;
  /**
   * The tools to use for the structured completion resource.
   */
  tools?: Chat.AnyTool[];
  /**
   * The debug name for the structured completion resource.
   */
  debugName?: string;
  /**
   * The API URL to use for the structured completion resource.
   */
  apiUrl?: ReactiveOption<string>;
  /**
   * The number of retries for the structured completion resource.
   */
  retries?: number;
  /**
   * The debounce time for the structured completion resource.
   */
  debounce?: number;

  /**
   * Optional transport override for this structured completion resource.
   */
  transport?: TransportOrFactory;
  /**
   * Whether this completion is UI generating.
   */
  ui?: boolean;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * Creates a structured completion resource.
 *
 * @public
 * @param options - The options for the structured completion resource.
 * @returns The structured completion resource.
 * @typeParam Input - The type of completion input.
 * @typeParam Schema - The schema that defines completion output.
 * @typeParam Output - The completion output inferred from the schema.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export function structuredCompletionResource<
  Input,
  Schema extends s.SchemaOutput,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(
  options: StructuredCompletionResourceOptions<Input, Schema, State>,
): StructuredCompletionResourceRef<Output, State> {
  return structuredCompletionResourceWithMessage<Input, Schema, Output, State>(
    options,
  ).ref;
}
