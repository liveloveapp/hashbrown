/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  linkedSignal,
  Resource,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import {
  Chat,
  type ComponentTreeSchema,
  type JsonValue,
  type PendingInterruptBatch,
  type ResumeOptions,
  s,
  type TransportOrFactory,
  ɵmergeOfferedComponents,
  ɵsetRequestResponseSchema,
} from '@hashbrownai/core';
import { ExposedComponent } from '../utils/expose-component.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import {
  TAG_NAME_REGISTRY,
  UiAssistantMessage,
  UiChatMessage,
} from '../utils/ui-chat.helpers';
import { ReactiveOption } from '../utils/types';
import { createUiKit, type UiKit, type UiKitInput } from '../utils/ui-kit.fn';
import { createResourceSnapshot } from './create-resource-snapshot.fn';

/**
 * @public
 */
export type UiChatMessageOutput = s.ObjectType<{
  ui: s.ArrayType<ComponentTreeSchema>;
}>;

/**
 * Options for the UI chat resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiChatResourceOptions<
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  /**
   * The components the model may render. Replace them later with
   * `setComponents`.
   */
  components: UiKitInput<ExposedComponent<any>>[];

  /**
   * The system prompt to use for the UI chat resource.
   */
  system: ReactiveOption<string>;

  /**
   * The initial messages for the UI chat resource.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  messages?: Chat.MessageInput<s.Infer<UiChatMessageOutput>, Tools>[];

  /** The initial shared agent state. */
  state?: State;

  /**
   * The tools to use for the UI chat resource.
   *
   * @typeParam Tools - The set of tool definitions available to the chat.
   */
  tools?: Tools[];

  /**
   * The debug name for the UI chat resource.
   */
  debugName?: string;

  /**
   * The debounce time for the UI chat resource.
   */
  debounce?: number;

  /**
   * The API URL to use for the UI chat resource.
   */
  apiUrl?: ReactiveOption<string>;

  /**
   * Custom transport override for the UI chat resource.
   */
  transport?: TransportOrFactory;

  /**
   * Optional opaque AG-UI thread identity.
   */
  threadId?: ReactiveOption<string | undefined>;
}

/**
 * A reference to the UI chat resource.
 *
 * @public
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export interface UiChatResourceRef<
  Tools extends Chat.AnyTool,
  State = unknown,
> extends Resource<UiChatMessage<Tools>[]> {
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
   * The components offered to the model on the next request: the
   * `components` option until `setComponents` replaces them.
   */
  readonly components: Signal<UiKitInput<ExposedComponent<any>>[]>;

  /**
   * Replace the components offered to the model. The change applies to the
   * next request, including a message sent right after.
   *
   * The chat keeps every component it has ever offered, one per name, with
   * the newest definition of a name replacing older ones. Messages render
   * with that set, so earlier answers still render after the list narrows,
   * and new responses are parsed against it too: a provider that does not
   * enforce the response schema strictly can still render a component that
   * was removed.
   *
   * @param components - The components to offer.
   */
  setComponents(components: UiKitInput<ExposedComponent<any>>[]): void;
  /**
   * Send a new user message to the chat.
   *
   * @param message - The user message to send.
   */
  sendMessage: (message: Chat.UserMessageInput) => void;

  /** Replace the current chat history. */
  setMessages: (
    messages: Chat.MessageInput<s.Infer<UiChatMessageOutput>, Tools>[],
  ) => void;

  /** Remove the last assistant response and resend the preceding history. */
  reload: () => boolean;

  /**
   * Cause current messages to be resent.  Can be used after an error in chat.
   */
  resendMessages: () => void;

  /**
   * Stops any currently-streaming message.
   *
   * @param clearStreamingMessage - Whether the currently-streaming message should be removed from state.
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
   * The last assistant message for the UI chat resource.
   */
  lastAssistantMessage: Signal<UiAssistantMessage<Tools> | undefined>;
}

/**
 * Creates a UI chat resource.
 *
 * @public
 * @param args - The arguments for the UI chat resource.
 * @returns The UI chat resource.
 * @typeParam Tools - The set of tool definitions available to the chat.
 * @typeParam State - The JSON-compatible state synchronized with the agent.
 */
export function uiChatResource<Tools extends Chat.AnyTool, State = unknown>(
  args: UiChatResourceOptions<Tools, State>,
): UiChatResourceRef<Tools, State> {
  const components = signal(args.components);
  // Every component the chat has offered, one per name, the newest
  // definition winning. Responses and history are parsed and rendered with
  // these, so an earlier answer keeps rendering after `setComponents` removes
  // its component.
  const offered = linkedSignal<
    UiKitInput<ExposedComponent<any>>[],
    ExposedComponent<any>[]
  >({
    source: components,
    computation: (next, previous) =>
      ɵmergeOfferedComponents<ExposedComponent<any>>(
        next,
        previous?.value ?? [],
      ),
  });
  // Same schema and implementations: keep the kit, so the chat's schema and
  // the message registry don't churn.
  const sameKit = (
    a: UiKit<ExposedComponent<any>>,
    b: UiKit<ExposedComponent<any>>,
  ) =>
    a.serializedSchema === b.serializedSchema &&
    Array.from(a.registry.values()).every((entry) => {
      const other = b.registry.get(entry.name);
      return (
        other !== undefined &&
        other.component === entry.component &&
        other.fallback === entry.fallback
      );
    });
  const uiKit = computed(
    () => createUiKit<ExposedComponent<any>>({ components: offered() }),
    { equal: sameKit },
  );
  const schema = computed(() => uiKit().schema);

  const chat = structuredChatResource({
    schema,
    tools: [...(args.tools ?? [])],
    system: args.system,
    state: args.state,
    messages: [...(args.messages ?? [])],
    debugName: args.debugName,
    debounce: args.debounce,
    apiUrl: args.apiUrl,
    transport: args.transport,
    ui: true,
    ...(Object.hasOwn(args, 'threadId') ? { threadId: args.threadId } : {}),
  });

  const value = computed(
    () => {
      const messages = chat.value();

      return messages.map((message): UiChatMessage<Tools> => {
        if (message.role === 'assistant') {
          const content = message.content as
            s.Infer<UiKit<ExposedComponent<any>>['schema']> | '' | undefined;

          if (!content) {
            return {
              ...message,
              [TAG_NAME_REGISTRY]: {},
            };
          }

          return {
            ...message,
            [TAG_NAME_REGISTRY]: uiKit().tagNameRegistry ?? {},
          };
        }
        if (message.role === 'user') {
          return message;
        }
        if (message.role === 'error') {
          return message;
        }

        throw new Error(`Unknown message role`);
      });
    },
    { debugName: args.debugName && `${args.debugName}.value` },
  );

  const lastAssistantMessage = computed(() => {
    return value().findLast((message) => message.role === 'assistant');
  });
  const snapshot = createResourceSnapshot(
    value,
    chat.status,
    chat.error,
    args.debugName && `${args.debugName}.snapshot`,
  );

  // The model is offered only the current components. Applied at once, so a
  // message sent right after uses them.
  let requestSchemaSet = false;
  function setComponents(next: UiKitInput<ExposedComponent<any>>[]) {
    components.set(next);
    const requestKit = createUiKit<ExposedComponent<any>>({ components: next });
    const narrowed =
      requestKit.serializedSchema !== untracked(uiKit).serializedSchema;
    if (!narrowed && !requestSchemaSet) return;
    requestSchemaSet = narrowed;
    ɵsetRequestResponseSchema(chat, narrowed ? requestKit.schema : undefined);
  }

  return {
    ...chat,
    components: components.asReadonly(),
    setComponents,
    hasValue: chat.hasValue as any,
    value,
    snapshot,
    lastAssistantMessage,
  };
}
