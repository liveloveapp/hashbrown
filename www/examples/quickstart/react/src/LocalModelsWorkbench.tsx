import { useStructuredChat } from '@hashbrownai/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  createWorkbenchStore,
  getWorkbenchPlanSchema,
  type WorkbenchStore,
  workbenchStructuredProps,
} from '../../runtime/workbench';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  createWorkbenchLocalTransport,
  workbenchLocalModelSystem,
} from '../../runtime/workbench-local-models';
import {
  canAcceptWorkbenchLocalPlan,
  createWorkbenchLocalController,
  mountWorkbenchLocalControls,
  observeWorkbenchLocalRun,
} from '../../runtime/workbench-local-controls';
import {
  messageOrigins,
  mountWorkbench,
  type ProposalOrigin,
  stopWorkbench,
  type SummaryProps,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

/** Renders an application-owned typed preview with explicit original-document acceptance. */
function LocalPlanCard({
  store,
  origin,
  proposal,
}: {
  readonly store: WorkbenchStore;
  readonly origin: ProposalOrigin;
  readonly proposal: SummaryProps;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [used, setUsed] = useState(false);
  const allowed = canAcceptWorkbenchLocalPlan(snapshot, origin, proposal, used);
  return (
    <article className="wb-summary" aria-label="Summary card">
      <span className="wb-muted">Typed plan · application component</span>
      <h2>{proposal.title || 'Building your plan…'}</h2>
      <ol>
        {proposal.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        className="wb-primary"
        disabled={!allowed}
        onClick={() => {
          if (
            canAcceptWorkbenchLocalPlan(
              store.getSnapshot(),
              origin,
              proposal,
              used,
            ) &&
            store.accept(proposal)
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

/** Runs genuine tool-free local structured chat after an explicit preparation gesture. */
export function LocalModelsWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() =>
    createWorkbenchStore('structured', { localModel: true }),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [transport] = useState(() => createWorkbenchLocalTransport(store));
  const [users, setUsers] = useState<Readonly<Record<string, ProposalOrigin>>>(
    {},
  );
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const controller = useRef<ReturnType<
    typeof createWorkbenchLocalController
  > | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const previousError = useRef<unknown>(undefined);
  const chat = useStructuredChat({
    system: workbenchLocalModelSystem,
    schema: getWorkbenchPlanSchema('local-models'),
    transport,
  });
  const current = useRef({ active, chat, navigation });
  const origins = messageOrigins(chat.messages, users);
  useLayoutEffect(() => {
    current.current = { active, chat, navigation };
  });
  useEffect(() => {
    if (!host.current) return;
    current.current.active = active;
    const preparation = createWorkbenchLocalController({
      store,
      active: () => current.current.active,
    });
    controller.current = preparation;
    const stop = () => {
      preparation.stop();
      stopWorkbench(store, current.current.chat);
    };
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      lesson: getWorkbenchLesson(window.location.search),
      send: (content) => {
        const runtime = current.current.chat;
        if (
          !preparation.canSend() ||
          runtime.isLoading ||
          runtime.isSending ||
          runtime.isReceiving ||
          runtime.isGenerating ||
          runtime.isResuming ||
          runtime.pendingInterrupts ||
          runtime.recovery.required
        )
          return;
        previousError.current = runtime.error;
        const message = store.send(content);
        const state = store.getSnapshot();
        setUsers((prior) => ({
          ...prior,
          [message.id]: {
            turn: state.turn,
            revision: state.application.revision,
          },
        }));
        runtime.sendMessage(message);
      },
      stop,
      reset: () => {
        if (preparation.mutable()) current.current.navigation.create();
      },
    });
    mounted.current = shell;
    const controls = mountWorkbenchLocalControls(
      host.current.querySelector<HTMLElement>('.wb-chat .wb-panel-head') ??
        shell.live,
      store,
      preparation,
    );
    shell.navigation(current.current.navigation);
    setLive(shell.live);
    return () => {
      current.current.active = false;
      stop();
      preparation.dispose();
      controls.dispose();
      shell.dispose();
      mounted.current = null;
      controller.current = null;
    };
  }, [store]);
  useLayoutEffect(() => {
    if (!active) {
      controller.current?.stop();
      stopWorkbench(store, chat);
      mounted.current?.pause();
    }
  }, [active, store]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  useEffect(() => {
    observeWorkbenchLocalRun(store, {
      active,
      messages: chat.messages,
      origins,
      busy:
        chat.isLoading ||
        chat.isSending ||
        chat.isReceiving ||
        chat.isGenerating ||
        chat.isResuming,
      error: chat.error,
      previousError: previousError.current,
      finishReason: chat.lastRunFinishReason,
      interrupted: !!chat.pendingInterrupts || chat.recovery.required,
    });
  }, [
    active,
    chat.messages,
    chat.isLoading,
    chat.isSending,
    chat.isReceiving,
    chat.isGenerating,
    chat.isResuming,
    chat.error,
    chat.lastRunFinishReason,
    chat.pendingInterrupts,
    chat.recovery.required,
    origins,
    snapshot,
    store,
  ]);
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            {chat.messages.map((message, index) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {String(message.content)}
                </p>
              ) : message.role === 'assistant' &&
                workbenchStructuredProps(message.content) ? (
                <LocalPlanCard
                  key={message.id}
                  store={store}
                  origin={origins[message.id] ?? { turn: -1, revision: -1 }}
                  proposal={{
                    title: message.content?.title ?? '',
                    steps: message.content?.steps ?? [],
                  }}
                />
              ) : message.role === 'error' ? (
                <p key={`error-${index}`} role="alert">
                  Local generation failed. Send a message to try again.
                </p>
              ) : null,
            )}
          </>,
          live,
        )}
    </>
  );
}
