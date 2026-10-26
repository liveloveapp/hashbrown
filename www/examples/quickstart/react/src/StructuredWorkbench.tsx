import { useStructuredChat, useTool } from '@hashbrownai/react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createWorkbenchStore,
  workbenchPlanSchema,
  workbenchStructuredProps,
  workbenchStructuredSystem,
} from '../../runtime/workbench';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';
import { Origin, Session, SummaryCard } from './Workbench';

/** Runs the canonical workbench with real Hashbrown streaming and read-only trace playback. */
export function StructuredWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const lesson = getWorkbenchLesson(window.location.search);
  const [store] = useState(() => createWorkbenchStore('structured'));
  const [transport] = useState(() =>
    createWorkbenchTransport(store, undefined, lesson.endpoint),
  );
  const [users, setUsers] = useState<Readonly<Record<string, ProposalOrigin>>>(
    {},
  );
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const recorded = useRef('');
  const readContext = useTool({
    name: 'readContext',
    description:
      'Read the current accepted plan and application revision. This tool never changes state.',
    handler: async () => {
      const result = store.getSnapshot().application;
      store.record('tool', { name: 'readContext', result });
      return result;
    },
    deps: [store],
  });
  const chat = useStructuredChat({
    system: workbenchStructuredSystem,
    schema: workbenchPlanSchema,
    tools: [readContext],
    transport,
  });
  const origins = messageOrigins(chat.messages, users);
  const commands = useRef({
    send: (content: string) => {
      void content; /* initialized below */
    },
    stop: () => {
      /* initialized below */
    },
    reset: () => {
      /* initialized below */
    },
  });
  useLayoutEffect(() => {
    commands.current = {
      send: (content) => {
        const message = store.send(content);
        const snapshot = store.getSnapshot();
        setUsers((previous) => ({
          ...previous,
          [message.id]: {
            turn: snapshot.turn,
            revision: snapshot.application.revision,
          },
        }));
        recorded.current = '';
        chat.sendMessage(message);
      },
      stop: () => {
        stopWorkbench(store, chat);
      },
      reset: () => {
        stopWorkbench(store, chat);
        chat.setMessages([]);
        setUsers({});
        recorded.current = '';
      },
    };
  });
  useEffect(() => {
    if (!host.current) return;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      lesson,
      send: (content) => commands.current.send(content),
      stop: () => commands.current.stop(),
      reset: () => commands.current.reset(),
    });
    mounted.current = shell;
    setLive(shell.live);
    return () => {
      shell.dispose();
      mounted.current = null;
    };
  }, [store]);
  useLayoutEffect(() => {
    if (!active) {
      commands.current.stop();
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  useEffect(() => {
    const message = chat.lastAssistantMessage;
    const snapshot = store.getSnapshot();
    if (snapshot.status !== 'loading') return;
    if (chat.error) {
      store.settle('error');
      return;
    }
    if (!message || origins[message.id]?.turn !== snapshot.turn) return;
    const serialized = JSON.stringify(message.content);
    if (serialized && serialized !== recorded.current) {
      recorded.current = serialized;
      store.parsed(message.content);
    }
    if (!chat.isLoading && chat.lastRunFinishReason)
      store.settle(
        chat.lastRunFinishReason === 'stop' && !chat.pendingInterrupts
          ? 'complete'
          : 'error',
        chat.lastRunFinishReason,
      );
  }, [
    chat.lastAssistantMessage,
    chat.isLoading,
    chat.error,
    chat.lastRunFinishReason,
    origins,
    store,
  ]);
  useEffect(
    () => () => {
      commands.current.stop();
    },
    [],
  );
  return (
    <Session.Provider value={store}>
      <div ref={host} />
      {live &&
        createPortal(
          <Fragment>
            {chat.messages.map((message, index) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {String(message.content)}
                </p>
              ) : message.role === 'assistant' &&
                workbenchStructuredProps(message.content) ? (
                <Origin.Provider
                  key={message.id}
                  value={origins[message.id] ?? { turn: -1, revision: -1 }}
                >
                  <SummaryCard
                    format="structured"
                    title={message.content?.title ?? ''}
                    steps={message.content?.steps ?? []}
                  />
                </Origin.Provider>
              ) : message.role === 'error' ? (
                <p key={`error-${index}`} role="alert">
                  The request failed. Send a message to try again.
                </p>
              ) : null,
            )}
          </Fragment>,
          live,
        )}
    </Session.Provider>
  );
}
