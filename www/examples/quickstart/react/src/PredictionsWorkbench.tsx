import { useStructuredCompletion } from '@hashbrownai/react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkbenchStore } from '../../runtime/workbench';
import { workbenchApplicationInput } from '../../runtime/workbench-recipe-input';
import {
  canUseWorkbenchRecipe,
  wasWorkbenchPredictionAccepted,
  wasWorkbenchPredictionDismissed,
} from '../../runtime/workbench-recipe-view';
import {
  isWorkbenchPredictions,
  workbenchActionLabels,
  workbenchPredictionsSchema,
  workbenchPredictionsSystem,
} from '../../runtime/workbench-recipes';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import type { WorkbenchNavigation } from '../../runtime/workbench-view';
import { useRecipeWorkbench } from './RecipeWorkbenchShell';

type Request = {
  contextId: string;
  prompt: string;
  application: ReturnType<typeof workbenchApplicationInput>;
};
function PredictionsRun({
  store,
  request,
}: {
  store: WorkbenchStore;
  request: Request;
}) {
  const [transport] = useState(() =>
    createWorkbenchTransport(
      store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
  );
  const completion = useStructuredCompletion({
    input: request,
    system: workbenchPredictionsSystem,
    schema: workbenchPredictionsSchema,
    transport,
    debounceTime: 0,
    retries: 0,
  });
  useEffect(() => {
    const snapshot = store.getSnapshot();
    if (
      snapshot.status !== 'loading' ||
      snapshot.frame?.messages.filter((item) => item.role === 'user').at(-1)
        ?.id !== request.contextId
    )
      return;
    if (completion.error) {
      store.settle('error');
      return;
    }
    if (!completion.isLoading && completion.lastRunFinishReason) {
      if (
        completion.lastRunFinishReason === 'stop' &&
        !completion.pendingInterrupts &&
        isWorkbenchPredictions(completion.output) &&
        completion.output.contextId === request.contextId &&
        store.recordRecipe(
          { kind: 'predictions', ...completion.output },
          request.contextId,
        )
      )
        store.settle('complete', 'stop');
      else store.settle('error', completion.lastRunFinishReason);
    }
  }, [
    completion.output,
    completion.isLoading,
    completion.error,
    completion.lastRunFinishReason,
    completion.pendingInterrupts,
    request,
    store,
  ]);
  return null;
}

/** Requests fresh structured predictions and makes acceptance and dismissal explicit. */
export function PredictionsWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const { store, snapshot, host, live, commands } = useRecipeWorkbench(
    'predictions',
    active,
    navigation,
  );
  const [request, setRequest] = useState<Request | null>(null);
  useLayoutEffect(() => {
    const stop = () => {
      store.settle('cancelled');
      setRequest(null);
    };
    commands.current = {
      send: (prompt) => {
        const user = store.send(prompt);
        setRequest({
          contextId: user.id,
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
  return (
    <>
      <div ref={host} />
      {active && request && snapshot.status === 'loading' && (
        <PredictionsRun
          key={request.contextId}
          request={request}
          store={store}
        />
      )}
      {live &&
        createPortal(
          <>
            {snapshot.frame?.messages.map((message) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {message.content}
                </p>
              ) : message.recipe?.kind === 'predictions' ? (
                <article
                  className="wb-summary"
                  aria-label="Predictive suggestions"
                  key={message.id}
                >
                  <span className="wb-muted">
                    Structured completion · current application context
                  </span>
                  {message.recipe.suggestions.length === 0 && (
                    <p role="status">No suggestions for this context.</p>
                  )}
                  {message.recipe.suggestions.map((suggestion) => {
                    const dismissed = wasWorkbenchPredictionDismissed(
                      snapshot,
                      message.id,
                      suggestion.actionId,
                    );
                    const accepted = wasWorkbenchPredictionAccepted(
                      snapshot,
                      message.id,
                      suggestion.actionId,
                    );
                    const alreadyAccepted =
                      snapshot.frame?.application.acceptedActions?.includes(
                        suggestion.actionId,
                      );
                    const allowed =
                      canUseWorkbenchRecipe(snapshot, message.id) &&
                      !dismissed &&
                      !alreadyAccepted;
                    return (
                      <section key={suggestion.actionId}>
                        <h2>{workbenchActionLabels[suggestion.actionId]}</h2>
                        <p>{suggestion.reason}</p>
                        <button
                          type="button"
                          className="wb-primary"
                          disabled={!allowed}
                          onClick={() =>
                            store.acceptPrediction(suggestion.actionId)
                          }
                        >
                          Accept {workbenchActionLabels[suggestion.actionId]}
                        </button>
                        <button
                          type="button"
                          disabled={!allowed}
                          onClick={() =>
                            store.dismissPrediction(suggestion.actionId)
                          }
                        >
                          Dismiss {workbenchActionLabels[suggestion.actionId]}
                        </button>
                        {dismissed && <p>Dismissed</p>}
                        {accepted && <p>Accepted</p>}
                      </section>
                    );
                  })}
                  {!canUseWorkbenchRecipe(snapshot, message.id) && (
                    <p className="wb-muted">
                      Request fresh suggestions for the current application
                      state.
                    </p>
                  )}
                </article>
              ) : null,
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'error' && (
              <p role="alert">
                Suggestions failed or did not match this context. Send a message
                to try again.
              </p>
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'cancelled' && (
              <p role="status">
                Suggestions cancelled. Send a message to try again.
              </p>
            )}
          </>,
          live,
        )}
    </>
  );
}
