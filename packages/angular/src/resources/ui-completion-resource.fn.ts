/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, Resource, Signal } from '@angular/core';
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
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredCompletionResourceWithMessage } from './structured-completion-resource-with-message.fn';
import {
  TAG_NAME_REGISTRY,
  UiAssistantMessage,
} from '../utils/ui-chat.helpers';
import { ReactiveOption } from '../utils/types';
import { UiChatMessageOutput } from './ui-chat-resource.fn';
import { createUiKit, type UiKitInput } from '../utils/ui-kit.fn';
import { createResourceSnapshot } from './create-resource-snapshot.fn';

/**
 * Options for the UI completion resource.
 *
 * @public
 * @typeParam Input - The type of completion input.
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiCompletionResourceOptions<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
  State = unknown,
> {
  /**
   * The components to use for the UI completion resource.
   */
  components: UiKitInput<ExposedComponent<any>>[];

  /**
   * The signal that produces the input for the completion.
   */
  input: Signal<Input | null | undefined>;

  /**
   * The system prompt to use for the UI completion resource.
   */
  system: ReactiveOption<string>;

  /** The initial shared agent state. */
  state?: State;

  /**
   * The tools to use for the UI completion resource.
   */
  tools?: Tools[];

  /**
   * The debug name for the UI completion resource.
   */
  debugName?: string;

  /**
   * The API URL to use for the UI completion resource.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * The number of retries for the UI completion resource.
   */
  retries?: number;

  /**
   * The debounce time for the UI completion resource.
   */
  debounce?: number;

  /**
   * Custom transport override for the UI completion resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * A reference to the UI completion resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiCompletionResourceRef<
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Resource<UiAssistantMessage<Tools> | null> {
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
   * Indicates whether the underlying completion call is currently sending a request.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the underlying completion call is currently receiving data.
   */
  isReceiving: Signal<boolean>;
  /**
   * Reloads the completion.
   *
   * @returns Whether the completion was reloaded.
   */
  reload: () => boolean;
  /**
   * Stops any currently streaming response.
   *
   * @param clearStreamingMessage - Whether to clear the current streaming response.
   */
  stop: (clearStreamingMessage?: boolean) => void;
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
}

/**
 * Creates a UI completion resource that returns UI assistant messages.
 *
 * @public
 * @param options - The options for the UI completion resource.
 * @returns The UI completion resource.
 * @typeParam Input - The type of completion input.
 * @typeParam Tools - The set of tool definitions available to the completion.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export function uiCompletionResource<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
  State = unknown,
>(
  options: UiCompletionResourceOptions<Input, Tools, State>,
): UiCompletionResourceRef<Tools, State> {
  const uiKit = createUiKit<ExposedComponent<any>>({
    components: options.components,
  });
  const internalSchema = uiKit.schema;

  const { ref: completion, message: completionMessage } =
    structuredCompletionResourceWithMessage<
      Input,
      typeof internalSchema,
      s.Infer<UiChatMessageOutput>,
      State
    >({
      input: options.input,
      schema: internalSchema,
      system: options.system,
      state: options.state,
      tools: options.tools,
      debugName: options.debugName,
      apiUrl: options.apiUrl,
      retries: options.retries,
      debounce: options.debounce,
      transport: options.transport,
      ui: true,
      ...(Object.hasOwn(options, 'threadId')
        ? { threadId: options.threadId }
        : {}),
    });

  const value = computed(
    (): UiAssistantMessage<Tools> | null => {
      const content = completion.value();
      const message = completionMessage();

      if (!content || !message) {
        return null;
      }

      const tagNameRegistry = uiKit.tagNameRegistry ?? {};

      return {
        id: message.id,
        role: 'assistant',
        content,
        toolCalls: [],
        [TAG_NAME_REGISTRY]: tagNameRegistry,
      };
    },
    { debugName: options.debugName && `${options.debugName}.value` },
  );
  const snapshot = createResourceSnapshot(
    value,
    completion.status,
    completion.error,
    options.debugName && `${options.debugName}.snapshot`,
  );

  function hasValue(this: UiCompletionResourceRef<Tools, State>) {
    return completion.status() !== 'error' && value() !== null;
  }

  return {
    pendingInterrupts: completion.pendingInterrupts,
    isResuming: completion.isResuming,
    resume: completion.resume,
    pendingConversationRecovery: completion.pendingConversationRecovery,
    resumeConversationRecovery: completion.resumeConversationRecovery,
    recovery: completion.recovery,
    restoreConversation: completion.restoreConversation,
    getRecoveryConfiguration: completion.getRecoveryConfiguration,
    state: completion.state,
    setState: completion.setState,
    value,
    snapshot,
    status: completion.status,
    error: completion.error,
    isLoading: completion.isLoading,
    reload: completion.reload,
    stop: completion.stop,
    isSending: completion.isSending,
    isReceiving: completion.isReceiving,
    lastRunResult: completion.lastRunResult,
    lastRunUsage: completion.lastRunUsage,
    lastRunFinishReason: completion.lastRunFinishReason,
    hasValue: hasValue as any,
  };
}
