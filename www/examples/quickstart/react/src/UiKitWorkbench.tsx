import {
  exposeComponent,
  useTool,
  useUiChat,
  useUiKit,
} from '@hashbrownai/react';
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
  isCurrentWorkbenchError,
  type WorkbenchStore,
} from '../../runtime/workbench';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  getWorkbenchUiComponents,
  getWorkbenchUiSystem,
  type WorkbenchUiComponent,
  workbenchUiPlanProps,
} from '../../runtime/workbench-ui-kits';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  canAcceptSummary,
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  stopWorkbench,
  type SummaryProps,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

const KitSession = createContext<{
  readonly store: WorkbenchStore;
  readonly active: boolean;
  readonly isActive: () => boolean;
} | null>(null);
const KitOrigin = createContext<ProposalOrigin>({ turn: -1, revision: -1 });

/** Shows an actual SDK fallback while required component props are unavailable. */
export function KitFallback() {
  return (
    <p className="wb-muted" data-kit-fallback role="status">
      Waiting for required plan fields…
    </p>
  );
}

function ProposalCard(
  props: SummaryProps & { readonly component: 'SummaryCard' | 'StepsCard' },
) {
  const session = useContext(KitSession);
  if (!session) throw new Error('A kit card requires its workbench session.');
  const snapshot = useSyncExternalStore(
    session.store.subscribe,
    session.store.getSnapshot,
  );
  const currentOrigin = useContext(KitOrigin);
  const [origin] = useState(() => currentOrigin);
  const [used, setUsed] = useState(false);
  const canAccept = () =>
    session.isActive() &&
    session.store.getSnapshot().frame?.uiComponent === props.component &&
    canAcceptSummary(session.store.getSnapshot(), origin, props, used);
  const allowed =
    session.active &&
    snapshot.frame?.uiComponent === props.component &&
    canAcceptSummary(snapshot, origin, props, used);
  return (
    <article
      className={
        props.component === 'StepsCard' ? 'wb-summary wb-steps' : 'wb-summary'
      }
      data-ui-component={props.component}
      aria-label={
        props.component === 'StepsCard' ? 'Steps card' : 'Summary card'
      }
    >
      <span className="wb-muted">{props.component} · trusted component</span>
      <h2>{props.title}</h2>
      <ol>
        {props.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        className="wb-primary"
        disabled={!allowed}
        onClick={() => {
          if (canAccept() && session.store.accept(props)) setUsed(true);
        }}
      >
        {used ? 'Plan accepted' : 'Accept plan'}
      </button>
      <p className="wb-muted">
        {used
          ? 'Saved to application state.'
          : allowed
            ? 'Ready for your review.'
            : session.active &&
                snapshot.cursor === null &&
                snapshot.status === 'loading' &&
                snapshot.turn === origin.turn
              ? 'Streaming preview · awaiting completion.'
              : 'Preview · unavailable for this run.'}
      </p>
    </article>
  );
}
/** Validated props offered to the UI kit. */
export interface KitPlanProps {
  readonly title: string;
  readonly steps: string[];
}
/** Proposes a plan using a compact summary presentation. */
export function KitSummaryCard(props: KitPlanProps) {
  return <ProposalCard {...props} component="SummaryCard" />;
}
/** Proposes a plan emphasizing its ordered actions. */
export function StepsCard(props: KitPlanProps) {
  return <ProposalCard {...props} component="StepsCard" />;
}
/** Displays a model report; authoritative accepted values remain in State. */
export function PlanReading(props: KitPlanProps) {
  return (
    <article
      className="wb-summary"
      data-ui-component="PlanReading"
      aria-label="Plan reading"
    >
      <span className="wb-muted">PlanReading · read-only model report</span>
      <h2>{props.title}</h2>
      <ol>
        {props.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <p className="wb-muted">State shows the authoritative accepted plan.</p>
    </article>
  );
}
function exposed(name: WorkbenchUiComponent, description: string) {
  return exposeComponent(
    name === 'StepsCard'
      ? StepsCard
      : name === 'PlanReading'
        ? PlanReading
        : KitSummaryCard,
    {
      name,
      description,
      props: workbenchUiPlanProps,
      children: false,
      fallback: KitFallback,
    },
  );
}
const proposalComponents = getWorkbenchUiComponents('ui-kits').map(
  ({ name, description }) => exposed(name, description),
);
const readingComponents = getWorkbenchUiComponents('ui-chatbot').map(
  ({ name, description }) => exposed(name, description),
);

/** Runs the canonical workbench with real Hashbrown streaming and read-only trace playback. */
export function UiKitWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const lesson = getWorkbenchLesson(window.location.search);
  const uiLesson = lesson.id === 'ui-chatbot' ? 'ui-chatbot' : 'ui-kits';
  const [store] = useState(() => createWorkbenchStore('ui', { uiLesson }));
  const mountedActive = useRef(false);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  });
  const kit = useUiKit({
    components: uiLesson === 'ui-kits' ? proposalComponents : readingComponents,
  });
  useEffect(() => {
    store.recordUiKit({
      registryMap: kit.registry,
      serializedSchema: kit.serializedSchema,
    });
  }, [store, kit]);
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
  const previousError = useRef<unknown>(undefined);
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
    system: getWorkbenchUiSystem(uiLesson),
    components: [kit],
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
        if (
          !mountedActive.current ||
          !activeRef.current ||
          store.getSnapshot().cursor !== null ||
          store.getSnapshot().status === 'loading'
        )
          return;
        previousError.current = chat.error;
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
    mountedActive.current = true;
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
      mountedActive.current = false;
      commands.current.stop();
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
    if (
      !mountedActive.current ||
      !activeRef.current ||
      snapshot.cursor !== null ||
      snapshot.status !== 'loading'
    )
      return;
    if (
      chat.error &&
      isCurrentWorkbenchError(
        snapshot,
        chat.messages,
        chat.error,
        previousError.current,
      )
    ) {
      store.settle('error');
      return;
    }
    if (
      !message ||
      origins[message.id]?.turn !== snapshot.turn ||
      origins[message.id]?.revision !== snapshot.application.revision
    )
      return;
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
    chat.messages,
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
    <KitSession.Provider
      value={{
        store,
        active,
        isActive: () => mountedActive.current && activeRef.current,
      }}
    >
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
                <KitOrigin.Provider
                  key={message.id}
                  value={origins[message.id] ?? { turn: -1, revision: -1 }}
                >
                  {message.ui}
                </KitOrigin.Provider>
              ) : message.role === 'error' ? (
                <p key={`error-${index}`} role="alert">
                  The request failed. Send a message to try again.
                </p>
              ) : null,
            )}
          </Fragment>,
          live,
        )}
    </KitSession.Provider>
  );
}
