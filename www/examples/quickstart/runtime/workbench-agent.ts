import { s } from '@hashbrownai/core';
/** Closed application-owned route selection; no executable handler comes from a model. */
export const workbenchAgentSchema = s.object(
  'Choose a read-only plan explanation',
  {
    route: s.enumeration(
      'Choose outline for outlining, record for recording, or clarify for ambiguous progress.',
      ['outline', 'record', 'clarify'],
    ),
  },
);
/** Safe actual decision fields and the application-selected read-only handler. */
export interface WorkbenchAgentTrace {
  readonly value: { readonly route: 'outline' | 'record' | 'clarify' } | null;
  readonly meta: { readonly route: { readonly confidence: number } } | null;
  readonly handler: 'outline' | 'record' | 'clarify';
  readonly fallback:
    null | 'low-confidence' | 'invalid' | 'unavailable' | 'clarify';
}
/** Checks custom server trace payloads before capture or historical inspection. */
export function decodeWorkbenchAgentTrace(
  input: unknown,
): WorkbenchAgentTrace | null {
  if (!input || typeof input !== 'object') return null;
  const trace = input as WorkbenchAgentTrace;
  const routes = ['outline', 'record', 'clarify'];
  if (
    !routes.includes(trace.handler) ||
    ![null, 'low-confidence', 'invalid', 'unavailable', 'clarify'].includes(
      trace.fallback,
    ) ||
    (trace.value !== null &&
      (!trace.value || !routes.includes(trace.value.route))) ||
    (trace.meta !== null &&
      (!trace.meta?.route ||
        !Number.isFinite(trace.meta.route.confidence) ||
        trace.meta.route.confidence < 0 ||
        trace.meta.route.confidence > 1))
  )
    return null;
  return {
    value: trace.value ? { route: trace.value.route } : null,
    meta: trace.meta
      ? { route: { confidence: trace.meta.route.confidence } }
      : null,
    handler: trace.handler,
    fallback: trace.fallback,
  };
}
/** Two prompts exercise the independent classifier turns. */
export const workbenchAgentPrompts = [
  'Help me outline the trusted UI demo.',
  'The outline is complete. Help me record the demo.',
] as const;
