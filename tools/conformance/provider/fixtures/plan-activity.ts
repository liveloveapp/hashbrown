import type { ActivityCallback } from '@hashbrownai/openai';

/**
 * Sends a `plan` activity before the model runs and patches it once the model
 * finishes, so hosts can assert the activity arrives ahead of the answer with
 * its patched content.
 */
export const planActivity: ActivityCallback = async ({ activity, model }) => {
  const plan = activity.snapshot('plan-1', 'plan', { step: 'Planning' });

  await model;

  plan.patch([{ op: 'replace', path: '/step', value: 'Done' }]);
};
