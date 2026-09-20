import type { createAssistantMiddleware } from './assistant-middleware';

type AssistantTools = Extract<
  Awaited<ReturnType<ReturnType<typeof createAssistantMiddleware>>>,
  { action: 'continue' }
>['context'];

const FUNCTIONS = [
  'ledgerSummary',
  'monthlyTotals',
  'aging',
  'customerStatement',
  'findRecords',
  'unappliedPayments',
  'validateUi',
] as const;

/** Resolve the read-only server context for the conversational agent. */
export function assistantTools(context: unknown): AssistantTools {
  if (!context || typeof context !== 'object' || !('middleware' in context))
    throw new Error('invalid_context');
  const tools = context.middleware as Record<string, unknown> | undefined;
  if (
    !tools ||
    !tools.responseSchema ||
    FUNCTIONS.some((name) => typeof tools[name] !== 'function')
  )
    throw new Error('invalid_context');
  return tools as unknown as AssistantTools;
}
