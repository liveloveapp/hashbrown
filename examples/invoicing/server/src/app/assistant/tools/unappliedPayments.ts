import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** Every payment that still needs matching (up to 20, newest first), each with up to 3 candidate open invoices and a candidateCount. Use for "what needs matching" questions and before offering ReviewPayment. */
export default function unappliedPayments(
  input: {
    /** Restrict to one ISO currency code. */
    readonly currency?: string;
  },
  context: B4ToolContext,
) {
  return assistantTools(context).unappliedPayments(input);
}
