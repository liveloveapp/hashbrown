import { useUiDecision } from '@hashbrownai/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  workbenchDecisionPlan,
  type WorkbenchStore,
} from '../../runtime/workbench';
import {
  workbenchApplicationInput,
  workbenchSelectionConfidence,
} from '../../runtime/workbench-recipe-input';
import { canUseWorkbenchRecipe } from '../../runtime/workbench-recipe-view';
import {
  workbenchSelectionMinConfidence,
  workbenchSelectionOptions,
  workbenchSelectionSystem,
  type WorkbenchViewId,
} from '../../runtime/workbench-recipes';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchDecisionTransport } from '../../runtime/workbench-decision-transport';
import type { WorkbenchNavigation } from '../../runtime/workbench-view';
import { useRecipeWorkbench } from './RecipeWorkbenchShell';

type PlanProps = { readonly title: string; readonly steps: readonly string[] };
/** The summary candidate uses only the application-owned plan. */
export function PlanSummary({ title, steps }: PlanProps) {
  return (
    <article className="wb-summary" aria-label="Plan summary">
      <span className="wb-muted">Application-owned plan · summary</span>
      <h2>{title}</h2>
      <p>{steps.join(' → ')}</p>
    </article>
  );
}
/** The ordered candidate uses the same application-owned plan. */
export function PlanSteps({ title, steps }: PlanProps) {
  return (
    <article className="wb-summary" aria-label="Plan steps">
      <span className="wb-muted">Application-owned plan · ordered steps</span>
      <h2>{title}</h2>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </article>
  );
}
const candidates = workbenchSelectionOptions.map((option) => ({
  ...option,
  element:
    option.id === 'summary' ? (
      <PlanSummary {...workbenchDecisionPlan} />
    ) : (
      <PlanSteps {...workbenchDecisionPlan} />
    ),
}));
type Request = {
  requestId: string;
  prompt: string;
  application: ReturnType<typeof workbenchApplicationInput>;
};
function SelectionRun({
  store,
  request,
  show,
  previewTarget,
  registerStop,
}: {
  store: WorkbenchStore;
  request: Request;
  show: boolean;
  previewTarget: HTMLElement | null;
  registerStop: (stop: () => void) => void;
}) {
  const [transport] = useState(() =>
    createWorkbenchDecisionTransport(
      store,
      request.requestId,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
  );
  const selection = useUiDecision({
    input: request,
    system: workbenchSelectionSystem,
    select: 'one',
    minConfidence: workbenchSelectionMinConfidence,
    optionOrder: 'declared',
    candidates,
    transport,
    debounceTime: 0,
  });
  useLayoutEffect(() => {
    registerStop(selection.decision.stop);
    return () =>
      registerStop(() => {
        /* No active request. */
      });
  }, [registerStop, selection.decision.stop]);
  useEffect(() => {
    const current = store.getSnapshot();
    if (
      current.status !== 'loading' ||
      current.frame?.messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id !== request.requestId
    )
      return;
    if (selection.error) {
      store.settle('error');
      return;
    }
    if (
      !selection.isLoading &&
      selection.decision.value &&
      selection.decision.meta
    ) {
      const confidence = workbenchSelectionConfidence(selection.decision.meta);
      if (confidence === null) {
        store.settle('error');
        return;
      }
      const selected = selection.ids.filter(
        (id): id is WorkbenchViewId => id === 'summary' || id === 'steps',
      );
      if (
        selection.ids.length !== selected.length ||
        !store.recordRecipe(
          { kind: 'selection', selected, confidence },
          request.requestId,
        )
      )
        store.settle('error');
      else store.settle('complete', 'stop');
    }
  }, [
    selection.ids,
    selection.isLoading,
    selection.error,
    selection.decision.value,
    selection.decision.meta,
    request,
    store,
  ]);
  return show && previewTarget
    ? createPortal(selection.ui, previewTarget)
    : null;
}

/** Previews actual SDK-selected candidates and commits only explicit confident or manual choices. */
export function SelectionWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const { store, snapshot, host, live, commands } = useRecipeWorkbench(
    'selection',
    active,
    navigation,
  );
  const [request, setRequest] = useState<Request | null>(null);
  const [previewTarget, setPreviewTarget] = useState<HTMLElement | null>(null);
  const abort = useRef<() => void>(() => {
    /* No active request. */
  });
  const registerStop = useRef((stop: () => void) => {
    abort.current = stop;
  }).current;
  useLayoutEffect(() => {
    const stop = () => {
      abort.current();
      store.settle('cancelled');
      setRequest(null);
    };
    commands.current = {
      send: (prompt) => {
        abort.current();
        const user = store.send(prompt);
        setRequest({
          requestId: user.id,
          prompt,
          application: workbenchApplicationInput(
            store.getSnapshot().application,
          ),
        });
      },
      stop,
      reset: stop,
    };
  });
  const manual = (id: WorkbenchViewId) => {
    if (store.getSnapshot().cursor !== null) return;
    abort.current();
    setRequest(null);
    store.manualSelection(id);
  };
  const useSdk =
    active &&
    request !== null &&
    (snapshot.status === 'loading' || snapshot.status === 'complete');
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            <PlanSummary {...workbenchDecisionPlan} />
            {snapshot.frame?.messages.map((message) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {message.content}
                </p>
              ) : message.recipe?.kind === 'selection' ? (
                <article
                  key={message.id}
                  aria-label="UI selection result"
                  className="wb-summary"
                >
                  <span className="wb-muted">
                    UI decision · trusted candidates
                  </span>
                  {message.recipe.selected.map(
                    (id) =>
                      !(
                        useSdk &&
                        snapshot.cursor === null &&
                        message.id === `recipe-${request?.requestId}`
                      ) &&
                      (id === 'summary' ? (
                        <PlanSummary key={id} {...workbenchDecisionPlan} />
                      ) : (
                        <PlanSteps key={id} {...workbenchDecisionPlan} />
                      )),
                  )}
                  {useSdk &&
                    snapshot.cursor === null &&
                    message.id === `recipe-${request?.requestId}` && (
                      <div
                        ref={setPreviewTarget}
                        aria-label="Selected view preview"
                      />
                    )}
                  <p>
                    Confidence: {Math.round(message.recipe.confidence * 100)}%
                  </p>
                  <button
                    type="button"
                    className="wb-primary"
                    disabled={!canUseWorkbenchRecipe(snapshot, message.id)}
                    onClick={() => store.applySelection()}
                  >
                    Use view
                  </button>
                  {message.recipe.selected.length === 0 && (
                    <p>Low confidence. Choose a view manually.</p>
                  )}
                </article>
              ) : null,
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'error' && (
              <p role="alert">
                View selection failed. Retry or choose a view manually.
              </p>
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'cancelled' && (
              <p role="status">
                Selection cancelled. Choose a view manually or send another
                request.
              </p>
            )}
            <p className="wb-muted">You can always choose a view manually.</p>
            <div className="wb-actions">
              <button
                type="button"
                disabled={snapshot.cursor !== null}
                onClick={() => manual('summary')}
              >
                Show summary
              </button>
              <button
                type="button"
                disabled={snapshot.cursor !== null}
                onClick={() => manual('steps')}
              >
                Show steps
              </button>
            </div>
            {snapshot.frame?.application.selectedView === 'steps' && (
              <PlanSteps {...workbenchDecisionPlan} />
            )}
          </>,
          live,
        )}
      {useSdk && live && (
        <SelectionRun
          key={request.requestId}
          request={request}
          store={store}
          previewTarget={previewTarget}
          show={snapshot.cursor === null}
          registerStop={registerStop}
        />
      )}
    </>
  );
}
