import type { B4ToolContext } from '@b4run/sdk';
import { assistantTools } from '../../../assistant-tools';

/** The client the user focused on the dashboard, as its statement, with the focused invoice when there is one; or focused: null. Call this first when the user says "this client" or "this invoice". */
export default function focusedClient(
  _input: Record<string, never>,
  context: B4ToolContext,
) {
  return assistantTools(context).focusedClient();
}
