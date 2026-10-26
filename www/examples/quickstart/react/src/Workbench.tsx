import { s } from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  createWorkbenchStore,
  type WorkbenchStore,
  workbenchSystem,
} from '../../runtime/workbench';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  canAcceptSummary,
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

const Session = createContext<WorkbenchStore | null>(null);
const Origin = createContext<ProposalOrigin>({ turn: -1, revision: -1 });

/** Renders validated streaming props; acceptance is an explicit, revision-checked action. */
export function SummaryCard(props: {
  readonly title: string;
  readonly steps: string[];
}) {
  const store = useContext(Session);
  if (!store) throw new Error('SummaryCard requires a workbench session.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const currentOrigin = useContext(Origin);
  const [origin] = useState(() => currentOrigin);
  const [used, setUsed] = useState(false);
  const allowed = canAcceptSummary(snapshot, origin, props, used);
  return (
    <article className="wb-summary" aria-label="Summary card">
      <span className="wb-muted">SummaryCard · trusted component</span>
      <h2>{props.title || 'Building your plan…'}</h2>
      <ol>
        {(props.steps ?? []).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        className="wb-primary"
        disabled={!allowed}
        onClick={() => {
          if (
            canAcceptSummary(store.getSnapshot(), origin, props, used) &&
            store.accept(props)
          )
            setUsed(true);
        }}
      >
        {used ? 'Plan accepted' : 'Accept plan'}
      </button>
      <p className="wb-muted">
        {used
          ? 'Saved to application state.'
          : allowed
            ? 'Ready for your review.'
            : 'Preview · unavailable for this run.'}
      </p>
    </article>
  );
}
const components = [
  exposeComponent(SummaryCard, {
    name: 'SummaryCard',
    description:
      'Propose a concise plan for the user to review and explicitly accept.',
    props: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A clear, concise action'),
      ),
    },
    children: false,
  }),
];

/** Runs the canonical workbench with real Hashbrown streaming and read-only trace playback. */
function WorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(createWorkbenchStore);
  const [transport] = useState(() => createWorkbenchTransport(store));
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
  const chat = useUiChat({
    system: workbenchSystem,
    components,
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
              ) : message.role === 'assistant' ? (
                <Origin.Provider
                  key={message.id}
                  value={origins[message.id] ?? { turn: -1, revision: -1 }}
                >
                  {message.ui}
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

/** Retains independent SDK conversations and their captured application histories. */
export function Workbench() {
  const [conversations, setConversations] = useState([
    { id: '1', label: 'Two-step plan' },
  ]);
  const [activeId, setActiveId] = useState('1');
  function create() {
    const id = String(conversations.length + 1);
    setConversations((previous) => [
      ...previous,
      { id, label: `Conversation ${id}` },
    ]);
    setActiveId(id);
  }
  return (
    <>
      {conversations.map((conversation) => (
        <div key={conversation.id} hidden={conversation.id !== activeId}>
          <WorkbenchConversation
            active={conversation.id === activeId}
            navigation={{
              currentId: conversation.id,
              conversations,
              select: setActiveId,
              create,
            }}
          />
        </div>
      ))}
    </>
  );
}
