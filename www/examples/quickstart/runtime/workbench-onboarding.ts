/** Fixed policy for rendering a first plan through the exposed application component. */
export const workbenchFirstPlanSystem =
  'Help a developer create a small two-step plan for a trusted UI demo. Render exactly one SummaryCard with a short title and exactly two concise steps: outline the demo, then record it. Do not call tools. Rendering is a preview and does not change application state.';
/** Fixed plain text policy for demonstrating retained conversation history. */
export const workbenchConversationSystem =
  'Help a developer discuss a small two-step plan in plain text. Remember the plan name supplied in this conversation and refer to that name on follow-up turns. Keep replies concise. Do not call tools or claim that application state changed.';
/** Public application policy pinned by the server and observed at the provider boundary. */
export const workbenchInstructionsSystem =
  'Explain the fixed application-owned plan in concise plain text. The plan is "Show how a model renders trusted UI". Its two steps are "Outline the trusted UI demo." and "Record the demo." Use this plan as the application context on every turn. Do not call tools or claim that application state changed.';
/** Deliberately different browser declaration, replaced by the endpoint policy. */
export const workbenchBrowserInstructions =
  'Explain a plan for planting a garden. Its steps are buy seeds and water them.';
/** Checked prompts shared by both framework clients and their recordings. */
export const workbenchOnboardingPrompts = {
  'first-plan': [
    'Create a two-step plan for a trusted UI demo.',
    'Make the second step shorter.',
  ],
  conversation: [
    'Call my two-step demo plan Lighthouse. What should I do first?',
    'What did I name my plan, and what comes next?',
  ],
  'system-instructions': [
    'What is the application plan?',
    'What is its first step?',
  ],
} as const;
/** Narrow public evidence emitted only after the OpenAI adapter mapping callback. */
export interface WorkbenchInstructionsTrace {
  readonly origin: 'OpenAI adapter mapping';
  readonly policy: string;
}
/** Selects the fixed public policy from actual mapped system input without copying private input. */
export function traceWorkbenchInstructions(mapped: {
  readonly input?: unknown;
}): WorkbenchInstructionsTrace | undefined {
  if (!Array.isArray(mapped.input)) return undefined;
  const present = mapped.input.some((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const message = item as Record<string, unknown>;
    return (
      message['role'] === 'system' &&
      message['content'] === workbenchInstructionsSystem
    );
  });
  return present
    ? { origin: 'OpenAI adapter mapping', policy: workbenchInstructionsSystem }
    : undefined;
}
