import type { PendingInterruptBatch } from '@hashbrownai/core';

/** Closed runtime state; the accepted application plan has its own revision. */
export interface WorkbenchWorkflowState {
  readonly planTitle: string;
  readonly status: 'idle' | 'draft' | 'ready';
}
/** The same application-owned plan is used in all three workflow lessons. */
export const workbenchWorkflowPlan = {
  title: 'Show how a model renders trusted UI',
  steps: ['Outline the trusted UI demo.', 'Record the demo.'],
} as const;
/** Initial shared SDK state; editing it does not start generation. */
export const workbenchWorkflowInitialState: WorkbenchWorkflowState = {
  planTitle: workbenchWorkflowPlan.title,
  status: 'idle',
};
/** Bounded plain-text agent policy, explicitly mapped to the model context. */
export const workbenchWorkflowSystem =
  'Explain the supplied two-step plan in at most 120 words. Preserve its steps. The shared state is context supplied by this local agent, not a tool result. Do not claim to execute, record, write, or save anything. Approval allows another explanation only.';
/** Two real user turns for the same plan conversation. */
export const workbenchWorkflowPrompts = [
  'Explain this two-step plan.',
  'Make the explanation shorter.',
] as const;
/** Validated agent activity content; these stages describe actual orchestration work. */
export interface WorkbenchWorkflowProgress {
  readonly stage: 'context-checked' | 'reply-complete';
  readonly label: string;
}
/** Plain captured SDK message, including activity links when the SDK supplies them. */
export interface WorkbenchWorkflowMessage {
  readonly id: string;
  readonly role: string;
  readonly content?: unknown;
  readonly activityType?: string;
  readonly hashbrownLinks?: Readonly<Record<string, unknown>>;
  readonly links?: Readonly<Record<string, unknown>>;
}
/** Live SDK values supplied by either framework, never reconstructed from transport events. */
export interface WorkbenchWorkflowObservationInput {
  readonly state: unknown;
  readonly messages: readonly unknown[];
  readonly pendingInterrupts?: PendingInterruptBatch;
  readonly isLoading: boolean;
  readonly isResuming: boolean;
  readonly error?: unknown;
  readonly finishReason?: string;
  readonly recoveryRequired?: boolean;
}
/** Immutable, normalized SDK facts stored on every workflow frame. */
export interface WorkbenchWorkflowObservation {
  /** Unmodified SDK state observed by the opt-in production client. */
  readonly productionState?: unknown;
  readonly state: WorkbenchWorkflowState | null;
  readonly messages: readonly WorkbenchWorkflowMessage[];
  readonly activities: readonly WorkbenchWorkflowMessage[];
  readonly pendingInterrupts?: PendingInterruptBatch;
  readonly isLoading: boolean;
  readonly isResuming: boolean;
  readonly error?: string;
  readonly finishReason?: string;
  readonly recoveryRequired?: boolean;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
/** Checks a closed, bounded state object before provider work or rendering. */
export function isWorkbenchWorkflowState(
  value: unknown,
): value is WorkbenchWorkflowState {
  const item = record(value);
  return (
    !!item &&
    Object.keys(item).length === 2 &&
    typeof item['planTitle'] === 'string' &&
    item['planTitle'].trim().length > 0 &&
    item['planTitle'].length <= 120 &&
    ['idle', 'draft', 'ready'].includes(String(item['status']))
  );
}
/** Checks agent-owned progress before a framework renders an activity card. */
export function isWorkbenchWorkflowProgress(
  value: unknown,
): value is WorkbenchWorkflowProgress {
  const item = record(value);
  return (
    !!item &&
    Object.keys(item).length === 2 &&
    ['context-checked', 'reply-complete'].includes(String(item['stage'])) &&
    typeof item['label'] === 'string' &&
    item['label'].length <= 160
  );
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
/** Copies actual SDK observations so historical frames cannot change with live state. */
export function normalizeWorkbenchWorkflowObservation(
  input: WorkbenchWorkflowObservationInput,
): WorkbenchWorkflowObservation {
  const messages = input.messages.flatMap((value) => {
    const item = record(value);
    return item &&
      typeof item['id'] === 'string' &&
      typeof item['role'] === 'string'
      ? [structuredClone(item) as unknown as WorkbenchWorkflowMessage]
      : [];
  });
  const pending = input.pendingInterrupts;
  const validPending =
    pending &&
    typeof pending.id === 'string' &&
    pending.interrupts.length === 2 &&
    new Set(pending.interrupts.map((entry) => entry.id)).size === 2 &&
    pending.interrupts.every(
      (entry) => typeof entry.id === 'string' && entry.reason === 'approval',
    );
  return immutable({
    state: isWorkbenchWorkflowState(input.state) ? { ...input.state } : null,
    messages,
    activities: messages.filter(
      (item) =>
        item.role === 'activity' &&
        item.activityType === 'plan-progress' &&
        isWorkbenchWorkflowProgress(item.content),
    ),
    ...(validPending ? { pendingInterrupts: structuredClone(pending) } : {}),
    isLoading: input.isLoading === true,
    isResuming: input.isResuming === true,
    recoveryRequired: input.recoveryRequired === true,
    ...(input.error
      ? {
          error:
            input.error instanceof Error
              ? input.error.message
              : String(input.error),
        }
      : {}),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
  });
}
