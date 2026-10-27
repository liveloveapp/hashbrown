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
import {
  createHistoryActions,
  observeHistory,
} from '../../runtime/workbench-history-client';
import { workbenchHistorySystem } from '../../runtime/workbench-history';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

/** Renders explicit application text copies alongside actual SDK text history. */
export function HistoryWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('history'));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [lesson] = useState(() => getWorkbenchLesson(window.location.search));
  const [transport] = useState(() =>
    createWorkbenchTransport(store, undefined, lesson.endpoint),
  );
  const chat = useChat({ system: workbenchHistorySystem, transport });
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
  const actions = createHistoryActions(
    store,
    observation,
    (messages) => chat.setMessages(messages),
    () => window.localStorage,
    () => active,
  );
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const commands = useRef({
    send: (content: string) => {
      void content; /* Assigned before mounting. */
    },
    stop: (force = false) => {
      void force; /* Assigned before mounting. */
    },
    read: () => {
      /* Assigned before mounting. */
    },
  });
  useLayoutEffect(() => {
    commands.current = {
      send: (content) => {
        if (!actions.sendable()) return;
        const message = store.send(content);
        try {
          chat.sendMessage(message);
        } catch (error) {
          actions.failSend(error);
        }
      },
      stop: (force = false) => {
        if (force || (active && store.getSnapshot().cursor === null))
          stopWorkbench(store, chat);
      },
      read: () => actions.select('Lighthouse'),
    };
  });
  useEffect(() => {
    if (!host.current) return;
    // Observe the mounted resource before the first explicit browser storage read.
    observeHistory(store, observation());
    if (lesson.id === 'save-text-conversations') commands.current.read();
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson,
      send: (content) => commands.current.send(content),
      stop: () => {
        if (store.getSnapshot().cursor === null) commands.current.stop();
      },
      reset: () => navigation.create(),
    });
    mounted.current = shell;
    setLive(shell.live);
    return () => {
      commands.current.stop(true);
      shell.dispose();
      mounted.current = null;
    };
  }, [store]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  useLayoutEffect(() => {
    if (!active) {
      commands.current.stop(true);
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
  const history = snapshot.frame?.history;
  const app = history?.app;
  const mutable = actions.mutable();
  const savable = actions.savable();
  const savedLesson = lesson.id === 'save-text-conversations';
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            <article
              className="wb-summary wb-history-controls"
              aria-label={
                savedLesson ? 'Saved text controls' : 'Retained text controls'
              }
            >
              {savedLesson ? (
                <>
                  <label>
                    Saved text{' '}
                    <select
                      aria-label="Saved text"
                      value={app?.selectedSlot ?? 'Lighthouse'}
                      disabled={!mutable}
                      onChange={(event) => {
                        const slot = event.target.value;
                        if (slot === 'Lighthouse' || slot === 'Harbor')
                          actions.select(slot);
                      }}
                    >
                      <option>Lighthouse</option>
                      <option>Harbor</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!savable}
                    onClick={() => actions.save()}
                  >
                    Save text
                  </button>
                  <button
                    type="button"
                    disabled={!mutable || app?.saved.status !== 'valid'}
                    onClick={() => actions.replace('load')}
                  >
                    Load text
                  </button>
                  <button
                    type="button"
                    disabled={!mutable}
                    onClick={() => actions.clearSlot()}
                  >
                    Clear saved text
                  </button>
                  <p className="wb-muted">
                    {app?.selectedSlot ?? 'Lighthouse'} ·{' '}
                    {app?.saved.status ?? 'empty'} · explicit application copy
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!savable}
                    onClick={() => actions.keep()}
                  >
                    Keep completed text
                  </button>
                  <button
                    type="button"
                    disabled={!mutable || !history?.sdk.messages.length}
                    onClick={() => actions.replace('clear')}
                  >
                    Clear messages
                  </button>
                  <button
                    type="button"
                    disabled={!mutable || !app?.retained}
                    onClick={() => actions.replace('restore')}
                  >
                    Restore kept text
                  </button>
                  <p className="wb-muted">
                    Kept text · {app?.retained?.messages.length ?? 0} messages ·
                    application memory
                  </p>
                </>
              )}
              {app?.action && <p role="status">{app.action}</p>}
            </article>
            {history?.sdk.messages.map((message, index) => (
              <p
                key={typeof message['id'] === 'string' ? message['id'] : index}
                className={
                  message['role'] === 'user' ? 'wb-user' : 'wb-history-reply'
                }
              >
                {typeof message['content'] === 'string'
                  ? message['content']
                  : ''}
              </p>
            ))}
            {(app?.error || history?.sdk.error) && (
              <p role="alert">{app?.error || history?.sdk.error}</p>
            )}
          </>,
          live,
        )}
    </>
  );
}
