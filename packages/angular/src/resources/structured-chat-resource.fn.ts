/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  Resource,
  ResourceStatus,
  runInInjectionContext,
  Signal,
  untracked,
} from '@angular/core';
import {
  Chat,
  createChatRuntime,
  type JsonValue,
  type PendingInterruptBatch,
  type ResumeOptions,
  s,
  type TransportOrFactory,
  ɵassertRuntimeMessageSchedulingAllowed,
} from '@hashbrownai/core';
import { ɵinjectHashbrownConfig } from '../providers/provide-hashbrown.fn';
import { readReactiveOption, toNgSignal } from '../utils/signals';
import { ReactiveOption } from '../utils/types';
import { bindToolToInjector } from '../utils/create-tool.fn';
import { createTransport } from '../utils/create-transport.fn';
import { toDeepSignal } from '../utils/deep-signal';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

/**
 * A reference to the structured chat resource.
 *
 * @public
 * @typeParam Output - The type of the output from the chat.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface StructuredChatResourceRef<
  Output,
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Resource<Chat.Message<Output, Tools>[]> {
  /** The currently visible shared agent state. */
  readonly state: Signal<State | undefined>;
  /** The complete pending interrupt batch, including while claimed. */
  readonly pendingInterrupts: Signal<PendingInterruptBatch | undefined>;
  /** Whether the resumed interaction is still running. */
  readonly isResuming: Signal<boolean>;
  /** Submit a complete response batch to resume the interrupted interaction. */
  resume(options: ResumeOptions): void;

  /** Replace shared agent state without starting a generation. */
  setState(state: State): void;
  /**
   * Indicates whether the underlying chat call is currently sending a message.
   */
  isSending: Signal<boolean>;
  /**
   * Indicates whether the chat is generating assistant output.
   */
  isGenerating: Signal<boolean>;
  /**
   * Whether the resource is currently receiving a response from the model.
   */
  isReceiving: Signal<boolean>;
  /**
   * Whether the chat is running tool calls.
   */
  isRunningToolCalls: Signal<boolean>;
  /**
   * Aggregate loading flag across transport, generation, and tool calls.
   */
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
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessageInput) => void;

  /**
   * Cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

  /**
   * Update the chat messages.
   *
   * @param messages - The new array of chat messages.
   */
  setMessages: (messages: Chat.MessageInput<Output, Tools>[]) => void;

  /**
   * Remove the last assistant response and re-send the previous user message. Returns true if a reload was performed.
   *
   * @returns Whether the resource was reloaded.
   */
  reload: () => boolean;

  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
   */
  stop: (clearStreamingMessage?: boolean) => void;
  lastAssistantMessage: Signal<
    Chat.AssistantMessage<Output, Tools> | undefined
  >;
}

/**
 * Options for the structured chat resource.
 *
 * @public
 * @typeParam Schema - The schema that defines assistant output.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam Output - The assistant output inferred from the schema.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface StructuredChatResourceOptions<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
> {
  /**
   * The system prompt to use for the structured chat resource.
   */
  system: ReactiveOption<string>;

  /**
   * The schema to use for the structured chat resource. Pass a signal to
   * change it after creation; the next request uses the latest schema.
   */
  schema: ReactiveOption<Schema>;

  /**
   * The tools to use for the structured chat resource.
   */
  tools?: Tools[];

  /**
   * The initial messages for the structured chat resource.
   */
  messages?: Chat.MessageInput<Output, Tools>[];

  /** The initial shared agent state. */
  state?: State;

  /**
   * The debug name for the structured chat resource.
   */
  debugName?: string;

  /**
   * The debounce time for the structured chat resource.
   */
  debounce?: number;

  /**
   * The number of retries for the structured chat resource.
   */
  retries?: number;

  /**
   * The API URL to use for the structured chat resource.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * Custom transport override for the structured chat resource.
   */
  transport?: TransportOrFactory;
  /**
   * Whether this structured chat is generating UI content.
   */
  ui?: boolean;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * Creates a structured chat resource.
 *
 * @public
 * @param options - The options for the structured chat resource.
 * @returns The structured chat resource.
 * @typeParam Schema - The schema that defines assistant output.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam Output - The assistant output inferred from the schema.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export function structuredChatResource<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(
  options: StructuredChatResourceOptions<Schema, Tools, Output, State>,
): StructuredChatResourceRef<Output, Tools, State> {
  const config = ɵinjectHashbrownConfig();
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const resolveTransport = () =>
    createTransport({
      transport: options.transport ?? config.transport,
      readBaseUrl: () =>
        options.apiUrl !== undefined
          ? readReactiveOption(options.apiUrl)
          : config.baseUrl,
      createMiddleware: () =>
        config.middleware?.map((middleware): Chat.Middleware => {
          return (requestInit) =>
            runInInjectionContext(injector, () => middleware(requestInit));
        }),
    });
  const runtime = createChatRuntime<Schema, Tools, Output, State>({
    system: readReactiveOption(options.system),
    state: options.state,
    messages: [...(options.messages ?? [])],
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    responseSchema: untracked(() => readReactiveOption(options.schema)),
    debugName: options.debugName,
    debounce: options.debounce,
    retries: options.retries,
    transport: resolveTransport(),
    ui: options.ui ?? false,
    threadId:
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined,
  });

  let previousThreadId =
    options.threadId !== undefined
      ? readReactiveOption(options.threadId)
      : undefined;
  // A schema with the same JSON Schema is not reapplied. Sends sync it first,
  // so a schema set right before a send is the one the request uses. The
  // last schema object is remembered, so an unchanged schema is never
  // serialized again (`uiChatResource` keeps the kit's schema object while
  // its serialized schema is unchanged).
  const schemaKeyOf = (schema: Schema) =>
    JSON.stringify(s.toJsonSchema(s.normalizeSchemaOutput(schema)));
  let appliedSchema = untracked(() => readReactiveOption(options.schema));
  let appliedSchemaKey = schemaKeyOf(appliedSchema);
  function syncSchema(schema: Schema) {
    if (schema === appliedSchema) return;
    appliedSchema = schema;
    const key = schemaKeyOf(schema);
    if (key === appliedSchemaKey) return;
    appliedSchemaKey = key;
    runtime.updateOptions({ responseSchema: schema });
  }
  const schemaEffect = effect(() => {
    const schema = readReactiveOption(options.schema);
    untracked(() => syncSchema(schema));
  });
  const syncLatestSchema = () =>
    syncSchema(untracked(() => readReactiveOption(options.schema)));

  const optionsEffect = effect(() => {
    const threadId =
      options.threadId !== undefined
        ? readReactiveOption(options.threadId)
        : undefined;
    const threadChanged = threadId !== previousThreadId;
    previousThreadId = threadId;
    runtime.updateOptions({
      system: readReactiveOption(options.system),
      transport: resolveTransport(),
      ui: options.ui ?? false,
      ...(Object.hasOwn(options, 'threadId') &&
      (threadChanged || threadId !== undefined)
        ? { threadId }
        : {}),
    });
  });

  const teardown = runtime.start();

  destroyRef.onDestroy(() => {
    teardown();
    optionsEffect.destroy();
    schemaEffect.destroy();
  });

  const rawValueSignal = toNgSignal(
    runtime.messages,
    options.debugName && `${options.debugName}.rawValue`,
  );
  const pendingInterrupts = toNgSignal(runtime.pendingInterrupts);
  const isResuming = toNgSignal(runtime.isResuming);
  const state = toNgSignal(
    runtime.state,
    options.debugName && `${options.debugName}.state`,
  );
  const rawValue = toDeepSignal(rawValueSignal);
  const isReceiving = toNgSignal(
    runtime.isReceiving,
    options.debugName && `${options.debugName}.isReceiving`,
  );
  const isSending = toNgSignal(
    runtime.isSending,
    options.debugName && `${options.debugName}.isSending`,
  );
  const isGenerating = toNgSignal(
    runtime.isGenerating,
    options.debugName && `${options.debugName}.isGenerating`,
  );
  const isRunningToolCalls = toNgSignal(
    runtime.isRunningToolCalls,
    options.debugName && `${options.debugName}.isRunningToolCalls`,
  );
  const isLoading = toNgSignal(
    runtime.isLoading,
    options.debugName && `${options.debugName}.isLoading`,
  );
  const error = toNgSignal(
    runtime.error,
    options.debugName && `${options.debugName}.error`,
  );
  const sendingError = toNgSignal(
    runtime.sendingError,
    options.debugName && `${options.debugName}.sendingError`,
  );
  const generatingError = toNgSignal(
    runtime.generatingError,
    options.debugName && `${options.debugName}.generatingError`,
  );
  const lastAssistantMessage = toNgSignal(
    runtime.lastAssistantMessage,
    options.debugName && `${options.debugName}.lastAssistantMessage`,
  );
  const lastRunResult = toNgSignal(
    runtime.lastRunResult,
    options.debugName && `${options.debugName}.lastRunResult`,
  );
  const status = computed(
    (): ResourceStatus => {
      if (isLoading()) {
        return 'loading';
      }

      if (error()) {
        return 'error';
      }

      const hasAssistantMessage = rawValue().some(
        (message) => message.role === 'assistant',
      );

      if (hasAssistantMessage) {
        return 'resolved';
      }

      return 'idle';
    },
    { debugName: options.debugName && `${options.debugName}.status` },
  );
  const value = createResourceValue(
    rawValue,
    status,
    error,
    options.debugName && `${options.debugName}.value`,
  );
  const snapshot = createResourceSnapshot(
    value,
    status,
    error,
    options.debugName && `${options.debugName}.snapshot`,
  );

  function reload() {
    ɵassertRuntimeMessageSchedulingAllowed(runtime);
    const messages = rawValue();
    // Activities never count as the last message: they trail the turn that
    // produced them, so reload drops them along with that turn's answer.
    const lastIndex = messages.findLastIndex(
      (message) => message.role !== 'activity',
    );
    const lastMessage = messages[lastIndex];

    if (lastMessage?.role === 'assistant') {
      syncLatestSchema();
      runtime.setMessages(messages.slice(0, lastIndex));

      return true;
    }

    return false;
  }

  function hasValue() {
    return (
      status() !== 'error' &&
      rawValue().some((message) => message.role === 'assistant')
    );
  }

  function sendMessage(message: Chat.UserMessageInput) {
    syncLatestSchema();
    runtime.sendMessage(message);
  }

  function resendMessages() {
    syncLatestSchema();
    runtime.resendMessages();
  }

  function setMessages(messages: Chat.MessageInput<Output, Tools>[]) {
    syncLatestSchema();
    runtime.setMessages(messages);
  }

  function setState(nextState: State) {
    runtime.setState(nextState);
  }

  function stop(clearStreamingMessage = false) {
    runtime.stop(clearStreamingMessage);
  }

  return {
    pendingInterrupts,
    isResuming,
    resume: runtime.resume,
    hasValue: hasValue as any,
    snapshot,
    status,
    state,
    isLoading,
    isGenerating,
    isSending,
    isReceiving,
    isRunningToolCalls,
    reload,
    sendMessage,
    resendMessages,
    stop,
    value,
    error,
    sendingError,
    lastRunResult,
    generatingError,
    setMessages,
    setState,
    lastAssistantMessage,
  };
}
