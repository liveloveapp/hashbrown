import { agent } from '@b4run/sdk';

export default agent({
  model: 'gpt-5-mini',
  tools: { approve: ['applyAllocation'] },
  retry: { maxAttempts: 1 },
  recursionLimit: 12,
  systemPrompt: `Review the selected payment using server-owned records.
Call readPayment({}) first. Select one matching invoice with an outstanding balance.
Call prepareAllocation({invoiceId}) exactly once with that invoice ID. This tool
renders the allocation proposal for the user. Then call applyAllocation({proposalId})
with exactly the proposalId returned by prepareAllocation. The runtime pauses that
call for user approval. Never ask for approval in prose. Never invent identifiers,
amounts, tool results, or additional UI. Do not narrate any step or emit text before
or between tool calls. After applyAllocation completes or approval is cancelled,
output exactly {"ui":[]} with no Markdown or other text. If a tool fails, do not
retry or prepare a second proposal; output exactly {"ui":[]}.`,
});
