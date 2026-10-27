import { useChat } from '@hashbrownai/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { createWorkbenchStore } from '../../runtime/workbench';
import { observeHistory } from '../../runtime/workbench-history-client';
import {
  workbenchHistorySystem,
  type WorkbenchTextDocument,
} from '../../runtime/workbench-history';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  createWorkbenchServerHistory,
  type WorkbenchServerLesson,
} from '../../runtime/workbench-server-history';
import { mountWorkbenchServerControls } from '../../runtime/workbench-server-controls';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

type Replacement = {
  readonly id: string;
  readonly messages: WorkbenchTextDocument['messages'];
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly applied?: boolean;
};

/** Runs real SDK text chat against an explicitly loaded, application-owned server thread. */
export function ServerWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('history'));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [lesson] = useState(() => getWorkbenchLesson(window.location.search));
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [threadId, setThreadId] = useState<string>();
  const controllerRef = useRef<ReturnType<
    typeof createWorkbenchServerHistory
  > | null>(null);
  const [transport] = useState(() =>
    createWorkbenchTransport(store, undefined, lesson.endpoint, {
      onResponse: (response) =>
        controllerRef.current?.captureResponse(response, 'chat'),
    }),
  );
  const chat = useChat({ system: workbenchHistorySystem, transport, threadId });
  const observation = () => ({
    messages: chat.messages,
    isLoading: chat.isLoading,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
    isResuming: chat.isResuming,
    finishReason: chat.lastRunFinishReason,
    error: chat.error,
    pendingInterrupts: chat.pendingInterrupts,
    recoveryRequired: chat.recovery.required,
  });
  const current = useRef({ observation, active, chat });
  useLayoutEffect(() => {
    current.current = { observation, active, chat };
  });
  const [controller] = useState(() =>
    createWorkbenchServerHistory({
      store,
      lesson: lesson.id as WorkbenchServerLesson,
      observation: () => current.current.observation(),
      active: () => current.current.active,
      replace: (id, messages) =>
        new Promise<void>((resolve, reject) => {
          setThreadId(id);
          setReplacement({ id, messages, resolve, reject });
        }),
    }),
  );
  useLayoutEffect(() => {
    controllerRef.current = controller;
  }, [controller]);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const stop = () => {
    controller.cancelPending();
    stopWorkbench(store, current.current.chat);
  };
  useEffect(() => {
    if (!replacement) return;
    if (!active) {
      replacement.reject(new Error('Conversation inactive'));
      setReplacement(null);
      return;
    }
    if (!replacement.applied) {
      // useChat's configuration effect has applied this render's threadId before this effect.
      try {
        chat.setMessages(
          replacement.messages.map((message) =>
            message.role === 'assistant'
              ? { ...message, role: 'assistant' as const, toolCalls: [] as [] }
              : { ...message, role: 'user' as const },
          ),
        );
        setReplacement({ ...replacement, applied: true });
      } catch (error) {
        replacement.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
        setReplacement(null);
      }
      return;
    }
    observeHistory(store, observation());
    replacement.resolve();
    setReplacement(null);
  }, [replacement, active]);
  useEffect(() => {
    if (!host.current) return;
    observeHistory(store, current.current.observation());
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson,
      send: (content) => {
        if (!controller.sendable()) return;
        const message = store.send(content);
        try {
          current.current.chat.sendMessage(message);
        } catch (error) {
          store.settle('error');
          store.failHistoryReplacement(error);
        }
      },
      stop: () => {
        if (current.current.active && store.getSnapshot().cursor === null)
          stop();
      },
      reset: () => navigation.create(),
    });
    mounted.current = shell;
    const controls = mountWorkbenchServerControls(
      shell.live,
      store,
      controller,
    );
    setLive(shell.live);
    void controller.initialize();
    return () => {
      stop();
      controller.dispose();
      controls.dispose();
      shell.dispose();
      mounted.current = null;
    };
  }, [store, controller]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  useLayoutEffect(() => {
    if (!active) {
      controller.cancelPending();
      stop();
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    observeHistory(store, observation());
  }, [
    store,
    chat.messages,
    chat.isLoading,
    chat.isSending,
    chat.isReceiving,
    chat.isGenerating,
    chat.isResuming,
    chat.lastRunFinishReason,
    chat.error,
    chat.pendingInterrupts,
    chat.recovery.required,
  ]);
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            {snapshot.frame?.history?.sdk.messages.map((message, index) => (
              <p
                key={typeof message['id'] === 'string' ? message['id'] : index}
                data-message-id={
                  typeof message['id'] === 'string' ? message['id'] : undefined
                }
                className={
                  message['role'] === 'user' ? 'wb-user' : 'wb-history-reply'
                }
              >
                {typeof message['content'] === 'string'
                  ? message['content']
                  : ''}
              </p>
            ))}
            {snapshot.frame?.history?.sdk.error && (
              <p role="alert">{snapshot.frame.history.sdk.error}</p>
            )}
          </>,
          live,
        )}
    </>
  );
}
