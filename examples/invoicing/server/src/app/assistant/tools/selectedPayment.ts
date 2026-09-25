import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** The payment the user selected on the page, with its candidate open invoices, or selected: null. Call this first when the user says "this payment" or "the selected payment". */
export default function selectedPayment(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return assistantTools(context).selectedPayment();
}
