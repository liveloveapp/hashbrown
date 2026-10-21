import type { RunAgentInput } from '@ag-ui/core';
import type { ActivityCallback } from '@hashbrownai/openai';

/**
 * Creates the activity callback for one run. It sends a `plan` activity
 * before the model runs and patches it once the model finishes, so hosts can
 * assert the activity arrives ahead of the answer with its patched content.
 * The activity id comes from the run id, so every turn gets its own activity
 * instead of overwriting an earlier turn's.
 *
 * @param input - The run the callback sends activities into.
 * @returns The activity callback for that run.
 */
export function createPlanActivity(input: RunAgentInput): ActivityCallback {
  return async ({ activity, model }) => {
    const plan = activity.snapshot(`plan-${input.runId}`, 'plan', {
      step: 'Planning',
    });

    await model;

    plan.patch([{ op: 'replace', path: '/step', value: 'Done' }]);
  };
}
