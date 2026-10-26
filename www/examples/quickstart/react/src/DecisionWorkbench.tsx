import { useDecision } from '@hashbrownai/react';
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
  isCurrentWorkbenchDecision,
  wasWorkbenchDecisionApplied,
  type WorkbenchApplication,
  workbenchDecisionPlan,
  workbenchDecisionSchema,
  workbenchDecisionSystem,
  type WorkbenchStore,
} from '../../runtime/workbench';
import { createWorkbenchDecisionTransport } from '../../runtime/workbench-decision-transport';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

type Request = {
  requestId: string;
  prompt: string;
  application: WorkbenchApplication;
};

function DecisionRun({
  store,
  request,
}: {
  store: WorkbenchStore;
  request: Request;
}) {
  const [transport] = useState(() =>
    createWorkbenchDecisionTransport(store, request.requestId),
  );
  const decision = useDecision({
    schema: workbenchDecisionSchema,
    system: workbenchDecisionSystem,
    input: {
      ...request,
      application: {
        revision: request.application.revision,
        nextAction: request.application.nextAction ?? null,
        plan: request.application.plan
          ? {
              title: request.application.plan.title,
              steps: [...request.application.plan.steps],
            }
          : null,
      },
    },
    transport,
    debounceTime: 0,
    retries: 0,
  });
  useEffect(() => {
    const snapshot = store.getSnapshot();
    if (!isCurrentWorkbenchDecision(snapshot, request.requestId)) return;
    const response = snapshot.events.some(
      (event) => event.turn === snapshot.turn && event.kind === 'event',
    );
    if (decision.error) store.settle('error');
    else if (
      !decision.isLoading &&
      decision.value &&
      decision.meta &&
      response
    ) {
      store.recordDecision(
        {
          nextAction: decision.value.nextAction,
          confidence: decision.meta.nextAction.confidence,
        },
        request.requestId,
      );
      store.settle('complete', 'stop');
    }
  }, [
    decision.value,
    decision.meta,
    decision.isLoading,
    decision.error,
    request.requestId,
    store,
  ]);
  return null;
}

/** Runs request-keyed SDK decisions and keeps application writes behind explicit review. */
export function DecisionWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('decision'));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [request, setRequest] = useState<Request | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const stop = () => {
    store.settle('cancelled');
  };
  useEffect(() => {
    if (!host.current) return;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      lesson: getWorkbenchLesson(window.location.search),
      send: (prompt) => {
        const message = store.send(prompt);
        setRequest({
          requestId: message.id,
          prompt,
          application: store.getSnapshot().application,
        });
      },
      stop,
      reset: stop,
    });
    mounted.current = shell;
    setLive(shell.live);
    return () => {
      store.settle('cancelled');
      shell.dispose();
    };
  }, [store]);
  useLayoutEffect(() => {
    if (!active) {
      stop();
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  return (
    <>
      <div ref={host} />
      {active && request && snapshot.status === 'loading' && (
        <DecisionRun key={request.requestId} request={request} store={store} />
      )}
      {live &&
        createPortal(
          <>
            <article className="wb-summary" aria-label="Application plan">
              <span className="wb-muted">Application-owned plan</span>
              <h2>{workbenchDecisionPlan.title}</h2>
              <ol>
                {workbenchDecisionPlan.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
            {snapshot.events.at(-1)?.messages.map((message) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {message.content}
                </p>
              ) : message.decision ? (
                <article
                  key={message.id}
                  className="wb-summary"
                  aria-label="Decision result"
                >
                  <span className="wb-muted">
                    Typed decision · application component
                  </span>
                  <h2>{message.decision.nextAction}</h2>
                  <p>
                    Confidence: {Math.round(message.decision.confidence * 100)}%
                  </p>
                  <button
                    className="wb-primary"
                    type="button"
                    disabled={
                      snapshot.cursor !== null ||
                      snapshot.status !== 'complete' ||
                      message.id !== `decision-${request?.requestId}` ||
                      message.decision.confidence < 0.75 ||
                      snapshot.application.revision !==
                        request?.application.revision
                    }
                    onClick={() => store.applyDecision()}
                  >
                    {wasWorkbenchDecisionApplied(snapshot, message.id)
                      ? 'Suggestion used'
                      : 'Use suggestion'}
                  </button>
                  <p className="wb-muted">
                    {message.decision.confidence < 0.75
                      ? 'Low confidence. Review the plan manually.'
                      : wasWorkbenchDecisionApplied(snapshot, message.id)
                        ? 'Saved next action to application state.'
                        : 'Review this suggestion before using it.'}
                  </p>
                </article>
              ) : null,
            )}
            {snapshot.status === 'cancelled' && (
              <p role="status">
                Decision cancelled. Retry or review the plan manually.
              </p>
            )}
            {snapshot.status === 'error' && (
              <p role="alert">
                Decision failed. Retry or review the plan manually.
              </p>
            )}
          </>,
          live,
        )}
    </>
  );
}
