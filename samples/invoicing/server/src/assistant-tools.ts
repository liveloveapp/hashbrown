import type { createAssistantMiddleware } from './assistant-middleware';

type AssistantTools = Extract<
  ReturnType<ReturnType<typeof createAssistantMiddleware>>,
  { action: 'continue' }
>['context'];

/** Resolve the read-only server context for the conversational agent. */
export function assistantTools(context: unknown): AssistantTools {
  if (!context || typeof context !== 'object' || !('middleware' in context))
    throw new Error('invalid_context');
  const tools = context.middleware as AssistantTools;
  if (
    !tools ||
    typeof tools.readLedger !== 'function' ||
    typeof tools.validatePayment !== 'function' ||
    !tools.responseSchema
  )
    throw new Error('invalid_context');
  return tools;
}
