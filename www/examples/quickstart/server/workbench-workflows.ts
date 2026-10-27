import { randomUUID } from 'node:crypto';
import {
  type AGUIEvent,
  EventType,
  type RunAgentInput,
  type RunFinishedEvent,
} from '@ag-ui/core';
import type { WorkbenchLessonId } from '../runtime/workbench-lessons';
import {
  isWorkbenchWorkflowState,
  workbenchWorkflowPlan,
  workbenchWorkflowSystem,
} from '../runtime/workbench-workflows';

/** Delegated provider boundary shared by the real host and deterministic verifier. */
export type WorkbenchWorkflowDelegate = (
  input: RunAgentInput,
  signal: AbortSignal,
  lesson?: WorkbenchLessonId,
) => AsyncIterable<AGUIEvent>;
interface ApprovalRecord {
  readonly ids: readonly string[];
  readonly expires: number;
  readonly consumed: boolean;
}
/** Creates a local demo agent; approval authority is bounded, expiring and process-local. */
export function createWorkbenchWorkflowStream(options: {
  readonly delegate: WorkbenchWorkflowDelegate;
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly maxRecords?: number;
}): WorkbenchWorkflowDelegate {
  const records = new Map<string, ApprovalRecord>();
  const activeThreads = new Set<string>();
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? 5 * 60_000;
  const limit = options.maxRecords ?? 128;
  if (
    !Number.isFinite(ttl) ||
    ttl <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  )
    throw new Error('Invalid approval storage bounds');
  const prune = () => {
    for (const [key, value] of records)
      if (value.expires <= now()) records.delete(key);
  };
  return async function* (input, signal, lesson) {
    if (!['shared-state', 'activities', 'interrupts'].includes(lesson ?? '')) {
      yield* options.delegate(input, signal, lesson);
      return;
    }
    if (!isWorkbenchWorkflowState(input.state))
      throw new Error('Invalid workflow state');
    if (signal.aborted) return;
    if (activeThreads.has(input.threadId))
      throw new Error('This thread has active work running');
    if (activeThreads.size >= limit)
      throw new Error('The workflow agent has too many active threads');
    prune();
    const previous = records.get(input.threadId);
    let approved = false;
    const resuming = input.resume !== undefined;
    if (resuming) {
      if (lesson !== 'interrupts' || !previous || previous.consumed)
        throw new Error('No pending approvals or decisions already consumed');
      const entries = input.resume;
      if (
        !entries ||
        entries.length !== previous.ids.length ||
        new Set(entries.map((entry) => entry.interruptId)).size !==
          previous.ids.length ||
        entries.some(
          (entry) =>
            !previous.ids.includes(entry.interruptId) ||
            !['resolved', 'cancelled'].includes(entry.status) ||
            (entry.status === 'resolved' &&
              (!entry.payload ||
                typeof entry.payload !== 'object' ||
                Array.isArray(entry.payload) ||
                Object.keys(entry.payload).length !== 1 ||
                typeof (entry.payload as { approved?: unknown }).approved !==
                  'boolean')) ||
            (entry.status === 'cancelled' && entry.payload !== undefined),
        )
      )
        throw new Error('Submit every approval with a valid boolean answer');
      approved = entries.every(
        (entry) =>
          entry.status === 'resolved' &&
          (entry.payload as { approved: boolean }).approved,
      );
      // Atomic claim occurs synchronously before the first provider await.
      records.set(input.threadId, { ...previous, consumed: true });
    } else if (previous && !previous.consumed) {
      throw new Error('Resolve this thread’s pending approvals first');
    }
    activeThreads.add(input.threadId);
    try {
      const identity = { threadId: input.threadId, runId: input.runId };
      yield { type: EventType.RUN_STARTED, ...identity };
      if (signal.aborted) return;
      if (resuming && !approved) {
        yield {
          type: EventType.CUSTOM,
          name: 'workbench.workflow-decision',
          value: { approved: false, protectedWork: false },
        };
        if (signal.aborted) return;
        yield {
          type: EventType.RUN_FINISHED,
          ...identity,
          outcome: { type: 'success' },
          metadata: { hashbrown: { finishReason: 'stop' } },
        };
        return;
      }
      const state = { ...input.state, status: 'draft' as const };
      yield { type: EventType.STATE_SNAPSHOT, snapshot: state };
      if (signal.aborted) return;
      const activityId = `plan-progress-${randomUUID()}`;
      if (lesson === 'activities')
        yield {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: activityId,
          activityType: 'plan-progress',
          content: {
            stage: 'context-checked',
            label: 'Shared plan context validated',
          },
          replace: true,
        };
      if (signal.aborted) return;
      const delegatedInput: RunAgentInput = {
        ...input,
        resume: undefined,
        tools: [],
        forwardedProps: { hashbrown: { ui: false } },
        messages: [
          {
            id: 'workbench-workflow-context',
            role: 'system',
            content: `${workbenchWorkflowSystem}\nValidated shared state: ${JSON.stringify(state)}\nApplication-owned steps: ${JSON.stringify(workbenchWorkflowPlan.steps)}${resuming ? '\nThe server validated and claimed both approvals. Explain the plan briefly.' : ''}`,
          },
          ...input.messages.filter(
            (message) =>
              message.role !== 'system' && message.role !== 'developer',
          ),
        ],
      };
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      let terminal: RunFinishedEvent | undefined;
      let failed = false;
      const iterator = options
        .delegate(delegatedInput, controller.signal, lesson)
        [Symbol.asyncIterator]();
      try {
        while (!signal.aborted) {
          const next = await iterator.next();
          if (signal.aborted || next.done) break;
          const event = next.value;
          if (event.type === EventType.RUN_STARTED) continue;
          if (event.type === EventType.RUN_FINISHED) {
            terminal = event;
            break;
          }
          if (event.type === EventType.RUN_ERROR) failed = true;
          yield event;
          if (failed) break;
        }
      } catch (error) {
        failed = true;
        if (!signal.aborted)
          yield {
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : 'Provider failed',
          };
      } finally {
        controller.abort();
        signal.removeEventListener('abort', abort);
        await iterator.return?.();
      }
      if (signal.aborted || failed) return;
      const reason =
        terminal?.metadata?.['hashbrown'] &&
        typeof terminal.metadata['hashbrown'] === 'object'
          ? (terminal.metadata['hashbrown'] as { finishReason?: unknown })
              .finishReason
          : undefined;
      if (
        !terminal ||
        terminal.threadId !== input.threadId ||
        terminal.runId !== input.runId ||
        reason !== 'stop' ||
        (terminal.outcome && terminal.outcome.type !== 'success')
      ) {
        yield {
          type: EventType.CUSTOM,
          name: 'workbench.workflow-outcome',
          value: {
            finishReason: reason ?? 'missing-terminal',
            ...(terminal ? { terminal } : {}),
          },
        };
        yield {
          type: EventType.RUN_ERROR,
          message: `The provider did not complete the reply (${String(reason ?? 'missing-terminal')}).`,
        };
        return;
      }
      yield {
        type: EventType.STATE_DELTA,
        delta: [{ op: 'replace', path: '/status', value: 'ready' }],
      };
      if (signal.aborted) return;
      if (lesson === 'activities')
        yield {
          type: EventType.ACTIVITY_DELTA,
          messageId: activityId,
          activityType: 'plan-progress',
          patch: [
            { op: 'replace', path: '/stage', value: 'reply-complete' },
            {
              op: 'replace',
              path: '/label',
              value: 'Provider explanation completed',
            },
          ],
        };
      if (signal.aborted) return;
      if (lesson === 'interrupts' && !resuming) {
        prune();
        if (!records.has(input.threadId) && records.size >= limit) {
          yield {
            type: EventType.RUN_ERROR,
            message:
              'Approval storage is full; try again after pending decisions expire.',
          };
          return;
        }
        const ids = [randomUUID(), randomUUID()];
        const expires = now() + ttl;
        if (signal.aborted) return;
        records.set(input.threadId, { ids, expires, consumed: false });
        yield {
          ...terminal,
          ...identity,
          outcome: {
            type: 'interrupt',
            interrupts: ids.map((id, index) => ({
              id,
              reason: 'approval',
              message:
                index === 0
                  ? 'May the agent continue with this plan?'
                  : 'May the agent produce a shorter explanation?',
              expiresAt: new Date(expires).toISOString(),
              responseSchema: {
                type: 'object',
                properties: { approved: { type: 'boolean' } },
                required: ['approved'],
                additionalProperties: false,
              },
            })),
          },
        };
      } else yield { ...terminal, ...identity, outcome: { type: 'success' } };
    } finally {
      activeThreads.delete(input.threadId);
    }
  };
}
