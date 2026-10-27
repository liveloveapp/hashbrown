import type { ResumeOptions } from '@hashbrownai/core';
import type { WorkbenchSnapshot } from './workbench';

/** Local application form answers, kept separately from SDK observations. */
export type WorkflowAnswers = Readonly<
  Record<string, 'approve' | 'decline' | ''>
>;
/** Reads only application drafts captured at or before the selected frame. */
export function readWorkflowForm(snapshot: WorkbenchSnapshot): {
  title?: string;
  answers: WorkflowAnswers;
} {
  const visible =
    snapshot.cursor === null
      ? snapshot.events
      : snapshot.events.slice(0, snapshot.cursor + 1);
  let title: string | undefined;
  let answers: WorkflowAnswers = {};
  const batchId = snapshot.frame?.workflow?.pendingInterrupts?.id;
  for (const event of visible) {
    if (
      event.kind !== 'form' ||
      !event.payload ||
      typeof event.payload !== 'object'
    )
      continue;
    const form = event.payload as {
      type?: string;
      title?: string;
      batchId?: string;
      answers?: WorkflowAnswers;
    };
    if (form.type === 'state-title-draft' && typeof form.title === 'string')
      title = form.title;
    if (
      form.type === 'approval-draft' &&
      form.batchId === batchId &&
      form.answers
    )
      answers = form.answers;
  }
  return { title, answers };
}
/** Locks application writes during replay, requests, approvals and recovery. */
export function canEditWorkflowState(snapshot: WorkbenchSnapshot): boolean {
  const workflow = snapshot.frame?.workflow;
  return (
    snapshot.cursor === null &&
    snapshot.status !== 'loading' &&
    snapshot.status !== 'paused' &&
    !workflow?.isLoading &&
    !workflow?.isResuming &&
    !workflow?.pendingInterrupts &&
    !workflow?.recoveryRequired
  );
}
/** Produces a whole original batch only while the current live form owns it. */
export function workflowResumeOptions(
  snapshot: WorkbenchSnapshot,
  batchId: string,
  answers: WorkflowAnswers,
  cancel = false,
): ResumeOptions | null {
  const workflow = snapshot.frame?.workflow;
  const batch = workflow?.pendingInterrupts;
  if (
    snapshot.cursor !== null ||
    snapshot.status !== 'paused' ||
    workflow?.isLoading ||
    workflow?.isResuming ||
    workflow?.recoveryRequired ||
    !batch ||
    batch.id !== batchId
  )
    return null;
  if (
    !cancel &&
    batch.interrupts.some(
      ({ id }) => !['approve', 'decline'].includes(answers[id]),
    )
  )
    return null;
  return {
    batchId,
    entries: batch.interrupts.map(({ id }) =>
      cancel
        ? { interruptId: id, status: 'cancelled' as const }
        : {
            interruptId: id,
            status: 'resolved' as const,
            payload: { approved: answers[id] === 'approve' },
          },
    ),
  };
}
