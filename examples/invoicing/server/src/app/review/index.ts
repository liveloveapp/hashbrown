import { agent } from '@b4run/sdk';

export default agent({
  model: 'gpt-5-mini',
  // A fixed two-step procedure with no judgement, so the least reasoning.
  reasoning: { effort: 'minimal' },
  tools: { approve: ['applyAllocation'] },
  retry: { maxAttempts: 1 },
  recursionLimit: 8,
  systemPrompt: `Review the selected payment using server-owned records.
Call prepareAllocation({}) exactly once; it prepares the proposal for the invoices the user selected.
Then call applyAllocation({proposalId}) with exactly the proposalId it returned. The runtime pauses that
call for the user's approval and the page shows the proposal. Never ask for approval in prose. Never invent
identifiers, amounts or tool results. Do not narrate or emit text before or between tool calls. If approval
is cancelled or a tool fails, do not retry or prepare a second proposal; output exactly {"ui":[]}.`,
});
