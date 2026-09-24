import type { B4ToolContext } from '@b4run/sdk';
import type { AssistantRenderInput } from '@invoicing/contracts';
import { assistantTools } from '../../../assistant-tools';

// The answer is this call's arguments, so a successful render ends the run
// without a closing model turn. A rejected render (invalid_ui) still goes back
// to the model, which fixes the named component and renders again.
export const returnDirect = true;

/** Show your answer to the user. Call exactly once, last. `text` is your prose; `components` are the kit pieces that support it, in order: LedgerTable for specific rows by ID, TrendChart for month-over-month, AgingSummary for overdue balances, CustomerCard for one client, ReviewPayment to offer matching an unapplied payment. Every ID must come from a tool result. On an invalid_ui error, fix the named component and call render once more. */
export default async function render(
  input: AssistantRenderInput,
  context: B4ToolContext,
) {
  // Validation is the whole job: every component must be in the kit and every
  // ID must exist in this session's snapshot. The browser renders the answer
  // from this call's own arguments, which Hashbrown streams to it, so there
  // is nothing to echo back as assistant text.
  await assistantTools(context).validateUi(input);
  return { rendered: true };
}
