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
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';
import {
  canEditWorkflowState,
  readWorkflowForm,
  workflowResumeOptions,
} from '../../runtime/workbench-workflow-form';
import {
  isWorkbenchWorkflowProgress,
  isWorkbenchWorkflowState,
  workbenchWorkflowInitialState,
  workbenchWorkflowPlan,
  workbenchWorkflowSystem,
} from '../../runtime/workbench-workflows';

/** Renders application controls from actual SDK workflow observations and immutable frames. */
export function WorkflowWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('workflow'));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [transport] = useState(() =>
    createWorkbenchTransport(
      store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
  );
  const chat = useChat({
    system: workbenchWorkflowSystem,
    state: workbenchWorkflowInitialState,
    transport,
  });
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const [live, setLive] = useState<HTMLElement | null>(null);
  const [localError, setLocalError] = useState('');
  const commands = useRef({
    send: (content: string) => {
      void content; /* Assigned before shell mount. */
    },
    stop: () => {
      /* Assigned before shell mount. */
    },
  });
  useLayoutEffect(() => {
    commands.current = {
      send: (content) => {
        if (!active || store.getSnapshot().frame?.workflow?.recoveryRequired)
          return;
        setLocalError('');
        const message = store.send(content);
        try {
          chat.sendMessage(message);
        } catch (error) {
          store.settle('error');
          setLocalError(String(error));
        }
      },
      stop: () => stopWorkbench(store, chat),
    };
  });
  useEffect(() => {
    if (!host.current) return;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson: getWorkbenchLesson(window.location.search),
      send: (content) => commands.current.send(content),
      stop: () => commands.current.stop(),
      reset: () => navigation.create(),
    });
    mounted.current = shell;
    setLive(shell.live);
    return () => {
      commands.current.stop();
      shell.dispose();
      mounted.current = null;
    };
  }, [store]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation, live]);
  useLayoutEffect(() => {
    if (!active) {
      commands.current.stop();
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    const accepted = store.recordWorkflow({
      state: chat.state,
      messages: chat.messages,
      pendingInterrupts: chat.pendingInterrupts,
      isLoading: chat.isLoading,
      isResuming: chat.isResuming,
      error: chat.error,
      finishReason: chat.lastRunFinishReason,
      recoveryRequired: chat.recovery.required,
    });
    if (
      accepted &&
      store.getSnapshot().status === 'loading' &&
      !chat.isLoading &&
      !chat.isResuming &&
      !chat.pendingInterrupts &&
      (chat.error || chat.lastRunFinishReason || chat.recovery.required)
    )
      store.settle(
        chat.error ||
          chat.recovery.required ||
          chat.lastRunFinishReason !== 'stop'
          ? 'error'
          : 'complete',
        chat.lastRunFinishReason,
      );
  }, [
    chat.state,
    chat.messages,
    chat.pendingInterrupts,
    chat.isLoading,
    chat.isResuming,
    chat.error,
    chat.lastRunFinishReason,
    chat.recovery.required,
    store,
  ]);
  const workflow = snapshot.frame?.workflow;
  const selectedStatus = snapshot.frame?.status ?? snapshot.status;
  const form = readWorkflowForm(snapshot);
  const editable = active && canEditWorkflowState(snapshot);
  const title =
    form.title ??
    workflow?.state?.planTitle ??
    workbenchWorkflowInitialState.planTitle;
  const visibleError =
    (snapshot.cursor === null ? localError : '') || workflow?.error;
  const batch = workflow?.pendingInterrupts;
  const submit = (cancel: boolean) => {
    if (!active || !batch) return;
    const options = workflowResumeOptions(
      store.getSnapshot(),
      batch.id,
      readWorkflowForm(store.getSnapshot()).answers,
      cancel,
    );
    if (!options || !store.beginResume(batch.id)) return;
    setLocalError('');
    try {
      chat.resume(options);
    } catch (error) {
      store.failResume();
      setLocalError(String(error));
    }
  };
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            <article
              className="wb-summary wb-workflow-state"
              aria-label="Shared SDK state"
            >
              <span className="wb-muted">
                Application-owned plan · local form draft
              </span>
              <ol>
                {workbenchWorkflowPlan.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <label>
                Plan title
                <input
                  aria-label="Plan title"
                  value={title}
                  maxLength={120}
                  disabled={!editable}
                  onChange={(event) => {
                    if (active && canEditWorkflowState(store.getSnapshot()))
                      store.record('form', {
                        type: 'state-title-draft',
                        title: event.target.value,
                      });
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!editable || !title.trim()}
                onClick={() => {
                  if (!active || !canEditWorkflowState(store.getSnapshot()))
                    return;
                  const state = {
                    ...(chat.state ?? workbenchWorkflowInitialState),
                    planTitle: title,
                  };
                  if (!isWorkbenchWorkflowState(state)) return;
                  try {
                    chat.setState(state);
                  } catch (error) {
                    setLocalError(String(error));
                  }
                }}
              >
                Set shared state
              </button>
              <p>
                SDK state:{' '}
                {workflow?.state?.planTitle ??
                  workbenchWorkflowInitialState.planTitle}{' '}
                · {workflow?.state?.status ?? 'idle'}
              </p>
              <p className="wb-muted">
                {selectedStatus === 'loading'
                  ? 'Draft · request running'
                  : selectedStatus === 'paused'
                    ? 'Paused · awaiting both answers'
                    : selectedStatus === 'complete'
                      ? 'Committed SDK state'
                      : selectedStatus === 'cancelled' ||
                          selectedStatus === 'error'
                        ? 'Request ended · SDK rollback shown'
                        : 'No request until Send'}
              </p>
            </article>
            {workflow?.messages.map((message) =>
              message.role === 'user' || message.role === 'assistant' ? (
                <p
                  key={message.id}
                  className={
                    message.role === 'user' ? 'wb-user' : 'wb-workflow-reply'
                  }
                >
                  {typeof message.content === 'string' ? message.content : ''}
                </p>
              ) : message.role === 'activity' &&
                message.activityType === 'plan-progress' &&
                isWorkbenchWorkflowProgress(message.content) ? (
                <article
                  key={message.id}
                  className="wb-summary wb-workflow-activity"
                  data-activity-id={message.id}
                >
                  <span className="wb-muted">SDK activity · {message.id}</span>
                  <p>{message.content.label}</p>
                  <p>{message.content.stage}</p>
                  <pre>
                    {JSON.stringify(
                      message.links ?? message.hashbrownLinks ?? {},
                      null,
                      2,
                    )}
                  </pre>
                </article>
              ) : null,
            )}
            {batch && (
              <article
                className="wb-summary wb-workflow-approvals"
                data-batch-id={batch.id}
              >
                <h2>Review both approvals</h2>
                <p className="wb-muted">
                  Application form · original SDK batch
                </p>
                {batch.interrupts.map((interrupt, index) => (
                  <label key={interrupt.id}>
                    {interrupt.message ?? 'Review this approval'}
                    <span className="wb-muted">{interrupt.id}</span>
                    <select
                      aria-label={`Approval ${index + 1}`}
                      value={form.answers[interrupt.id] ?? ''}
                      disabled={
                        !active ||
                        !workflowResumeOptions(snapshot, batch.id, {}, true)
                      }
                      onChange={(event) => {
                        const current = store.getSnapshot();
                        if (
                          !active ||
                          !workflowResumeOptions(current, batch.id, {}, true)
                        )
                          return;
                        store.record('form', {
                          type: 'approval-draft',
                          batchId: batch.id,
                          answers: {
                            ...readWorkflowForm(current).answers,
                            [interrupt.id]: event.target.value,
                          },
                        });
                      }}
                    >
                      <option value="">Choose an answer</option>
                      <option value="approve">Approve</option>
                      <option value="decline">Decline</option>
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  disabled={
                    !active ||
                    !workflowResumeOptions(snapshot, batch.id, form.answers)
                  }
                  onClick={() => submit(false)}
                >
                  Submit answers
                </button>
                <button
                  type="button"
                  disabled={
                    !active ||
                    !workflowResumeOptions(snapshot, batch.id, {}, true)
                  }
                  onClick={() => submit(true)}
                >
                  Cancel approvals
                </button>
              </article>
            )}
            {workflow?.isResuming && (
              <p role="status">Resuming the same turn…</p>
            )}
            {workflow?.recoveryRequired && (
              <p role="alert">
                Resume failed after acknowledgement. Start a new conversation.
              </p>
            )}
            {visibleError && <p role="alert">{visibleError}</p>}
          </>,
          live,
        )}
    </>
  );
}
