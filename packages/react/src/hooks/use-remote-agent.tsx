/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpAgent, randomUUID, type AgentSubscriber } from '@ag-ui/client';
import {
  type InputContent,
  type Message,
  type State,
} from '@ag-ui/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  useRemoteToolsStore,
  type RemoteToolRegistration,
} from './use-remote-agent-tool';

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
};

const serializeToolResult = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * The input accepted by {@link useRemoteAgent}'s `sendMessage` function.
 *
 * @public
 */
export type RemoteAgentSendMessageInput =
  | string
  | {
      content?:
        | string
        | InputContent[];
      id?: string;
      name?: string;
      role?: 'user' | 'system' | 'developer';
    };

const createUserMessage = (input: RemoteAgentSendMessageInput): Message => {
  if (typeof input === 'string') {
    return {
      id: randomUUID(),
      role: 'user',
      content: input,
    };
  }

  const role = input.role ?? 'user';

  if (role === 'user') {
    return {
      id: input.id ?? randomUUID(),
      role,
      name: input.name,
      content: input.content ?? '',
    };
  }

  const stringContent =
    typeof input.content === 'string' ? input.content : '';

  return {
    id: input.id ?? randomUUID(),
    role,
    name: input.name,
    content: stringContent,
  };
};

/**
 * Options for configuring {@link useRemoteAgent}.
 *
 * @public
 */
export interface UseRemoteAgentOptions {
  url: string;
  headers?: Record<string, string>;
  agentId?: string;
  description?: string;
  threadId?: string;
  initialMessages?: Message[];
  initialState?: State;
  debug?: boolean;
}

/**
 * The result returned by {@link useRemoteAgent}.
 *
 * @public
 */
export interface UseRemoteAgentResult {
  messages: Message[];
  isRunning: boolean;
  currentTool?: string;
  error?: Error;
  sendMessage: (input: RemoteAgentSendMessageInput) => Promise<void>;
}

type ToolCallEndParams = Parameters<
  NonNullable<AgentSubscriber['onToolCallEndEvent']>
>[0];

const toToolMetadata = (tools: RemoteToolRegistration[]) => {
  return tools.map((entry) => ({
    name: entry.tool.name,
    description: entry.tool.description,
    parameters: entry.parameters,
  }));
};

/**
 * React hook that connects a Hashbrown UI to a remote AG-UI agent.
 *
 * @public
 */
export const useRemoteAgent = (
  options: UseRemoteAgentOptions,
): UseRemoteAgentResult => {
  const headersKey = useMemo(
    () => safeStringify(options.headers),
    [options.headers],
  );
  const initialMessagesKey = useMemo(
    () => safeStringify(options.initialMessages),
    [options.initialMessages],
  );
  const initialStateKey = useMemo(
    () => safeStringify(options.initialState),
    [options.initialState],
  );

  const agent = useMemo(() => {
    return new HttpAgent({
      url: options.url,
      headers: options.headers,
      agentId: options.agentId,
      description: options.description,
      threadId: options.threadId,
      initialMessages: options.initialMessages,
      initialState: options.initialState,
      debug: options.debug,
    });
    // stringified dependencies keep the agent stable unless deep values change
  }, [
    headersKey,
    initialMessagesKey,
    initialStateKey,
    options.agentId,
    options.debug,
    options.description,
    options.threadId,
    options.url,
  ]);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [messages, setMessages] = useState<Message[]>(
    () => agent.messages.slice(),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | undefined>();
  const [error, setError] = useState<Error | undefined>();

  const toolsStore = useRemoteToolsStore();
  const remoteTools = useSyncExternalStore(
    toolsStore.subscribe,
    toolsStore.getSnapshot,
    toolsStore.getSnapshot,
  );
  const toolsRef = useRef<RemoteToolRegistration[]>(remoteTools);
  useEffect(() => {
    toolsRef.current = remoteTools;
  }, [remoteTools]);

  const runQueueRef = useRef<Promise<void>>(Promise.resolve());
  const abortControllerRef = useRef<AbortController | undefined>();
  const toolAbortControllers = useRef(new Map<string, AbortController>());

  const syncMessages = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    setMessages(agent.messages.slice());
  }, [agent]);

  const abortToolExecutions = useCallback(() => {
    toolAbortControllers.current.forEach((controller) => {
      controller.abort();
    });
    toolAbortControllers.current.clear();
  }, []);

  useEffect(() => {
    const nextMessages = agent.messages.slice();
    setMessages(nextMessages);

    return () => {
      abortToolExecutions();
      abortControllerRef.current?.abort();
      agent.abortRun();
    };
  }, [abortToolExecutions, agent]);

  const subscriberRef = useRef<AgentSubscriber>();

  const enqueueRun = useCallback(() => {
    const start = runQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setError(undefined);
        const aguiTools = toToolMetadata(toolsRef.current);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
          await agent.runAgent(
            {
              tools: aguiTools,
              abortController,
            },
            subscriberRef.current,
          );
        } catch (err) {
          if (mountedRef.current && err instanceof Error) {
            setError(err);
          }
          throw err;
        } finally {
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = undefined;
          }
        }
      });

    runQueueRef.current = start.then(
      () => undefined,
      () => undefined,
    );

    return start as Promise<void>;
  }, [agent]);

  const handleToolCall = useCallback(
    async (params: ToolCallEndParams) => {
      const { toolCallArgs, toolCallName, event } = params;
      const registration = toolsRef.current.find(
        (entry) => entry.tool.name === toolCallName,
      );

      if (!registration) {
        const missingToolError = new Error(
          `Remote tool "${toolCallName}" is not registered.`,
        );
        if (mountedRef.current) {
          setError(missingToolError);
        }
        agent.addMessage({
          id: randomUUID(),
          role: 'tool',
          content: JSON.stringify({ error: missingToolError.message }),
          toolCallId: event.toolCallId,
        });
        syncMessages();
        void enqueueRun().catch(() => undefined);
        return;
      }

      const abortController = new AbortController();
      toolAbortControllers.current.set(event.toolCallId, abortController);

      try {
        const handler = registration.tool.handler as any;
        const result = registration.acceptsArguments
          ? await handler(toolCallArgs, abortController.signal)
          : await handler(abortController.signal);

        agent.addMessage({
          id: randomUUID(),
          role: 'tool',
          content: serializeToolResult(result),
          toolCallId: event.toolCallId,
        });
        syncMessages();
      } catch (err) {
        const toolError =
          err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(toolError);
        }
        agent.addMessage({
          id: randomUUID(),
          role: 'tool',
          content: JSON.stringify({ error: toolError.message }),
          toolCallId: event.toolCallId,
        });
        syncMessages();
      } finally {
        toolAbortControllers.current.delete(event.toolCallId);
        void enqueueRun().catch(() => undefined);
      }
    },
    [agent, enqueueRun, syncMessages],
  );

  const subscriber = useMemo<AgentSubscriber>(() => {
    return {
      onMessagesChanged: ({ messages: updatedMessages }) => {
        if (!mountedRef.current) {
          return;
        }
        setMessages(updatedMessages.slice());
      },
      onRunStartedEvent: () => {
        if (!mountedRef.current) {
          return;
        }
        setIsRunning(true);
      },
      onRunFinishedEvent: () => {
        abortToolExecutions();
        if (!mountedRef.current) {
          return;
        }
        setIsRunning(false);
        setCurrentTool(undefined);
      },
      onRunErrorEvent: ({ event }) => {
        abortToolExecutions();
        if (!mountedRef.current) {
          return;
        }
        setIsRunning(false);
        setCurrentTool(undefined);
        setError(
          new Error(event.message ?? 'Remote agent encountered an error'),
        );
      },
      onToolCallStartEvent: ({ event }) => {
        if (!mountedRef.current) {
          return;
        }
        setCurrentTool(event.toolCallName);
      },
      onToolCallEndEvent: async (params) => {
        await handleToolCall(params);
        if (!mountedRef.current) {
          return;
        }
        setCurrentTool(undefined);
      },
    };
  }, [abortToolExecutions, handleToolCall]);

  useEffect(() => {
    subscriberRef.current = subscriber;
  }, [subscriber]);

  const sendMessage = useCallback(
    async (input: RemoteAgentSendMessageInput) => {
      const message = createUserMessage(input);
      agent.addMessage(message);
      syncMessages();

      await enqueueRun();
    },
    [agent, enqueueRun, syncMessages],
  );

  return {
    messages,
    isRunning,
    currentTool,
    error,
    sendMessage,
  };
};
