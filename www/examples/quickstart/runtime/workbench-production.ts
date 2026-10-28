import type { ConversationSnapshot } from '@hashbrownai/core';

/** Version of the reference's pinned server instructions, tools and recovery projection. */
export const PRODUCTION_CONFIG = 'recording-plan-v1';

/** Fixed application-owned plan reviewed before the server approval can commit it. */
export const PRODUCTION_PLAN = {
  title: 'Record a Hashbrown demo',
  steps: ['Outline the demo', 'Record the demo'],
} as const;

/** Durable application data, stored separately from the agent checkpoint. */
export interface ProductionState {
  readonly revision: number;
  readonly plan: {
    readonly title: string;
    readonly steps: readonly string[];
  } | null;
}

/** Stable initial SDK state; importing it never reads or writes server application data. */
export const PRODUCTION_INITIAL_STATE: ProductionState = {
  revision: 0,
  plan: null,
};

/** Owner-checked recovery read; an operational disposition is distinct from SDK restoration. */
export interface ProductionRecovery {
  readonly configuration: typeof PRODUCTION_CONFIG;
  readonly disposition: 'idle' | 'paused' | 'busy' | 'unknown';
  readonly snapshot: ConversationSnapshot<ProductionState>;
  readonly application: ProductionState;
}

/** Validates the bounded application envelope; the SDK validates native history on restoration. */
export function readProductionRecovery(input: unknown): ProductionRecovery {
  if (!input || typeof input !== 'object')
    throw new Error('Invalid recovery response.');
  const value = input as Partial<ProductionRecovery>;
  if (value.configuration !== PRODUCTION_CONFIG)
    throw new Error('Recovery configuration changed. Start a new thread.');
  const app = value.application;
  const snapshot = value.snapshot;
  if (
    !['idle', 'paused', 'busy', 'unknown'].includes(value.disposition ?? '') ||
    !snapshot ||
    typeof snapshot.threadId !== 'string' ||
    !/^[a-zA-Z0-9_.:-]{1,128}$/.test(snapshot.threadId) ||
    !Array.isArray(snapshot.messages) ||
    snapshot.messages.length > 2048 ||
    !app ||
    !Number.isSafeInteger(app.revision) ||
    app.revision < 0 ||
    (app.plan !== null &&
      (!app.plan ||
        typeof app.plan.title !== 'string' ||
        app.plan.title.length > 200 ||
        !Array.isArray(app.plan.steps) ||
        app.plan.steps.length !== 2 ||
        app.plan.steps.some(
          (step) => typeof step !== 'string' || step.length > 500,
        )))
  )
    throw new Error('Invalid recovery response.');
  return value as ProductionRecovery;
}
