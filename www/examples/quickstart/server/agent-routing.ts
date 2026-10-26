import { DecisionResponseError, decodeDecision, s } from '@hashbrownai/core';
import { DecisionError } from '@hashbrownai/typesafe';

/** The support routes and instructions are owned by this server. */
export const agentSchema = s.object('Choose one read-only support route', {
  route: s.enumeration(
    'Choose order for order tracking, returns for the returns policy, or clarify when the message is ambiguous or unrelated.',
    ['order', 'returns', 'clarify'],
  ),
});

/** A classifier receives only application-selected text and server-owned policy. */
export type AgentClassifier = (options: {
  readonly request: { readonly state: string };
  readonly schema: typeof agentSchema;
  readonly signal: AbortSignal;
}) => Promise<unknown>;

/** Read-only application integrations; the model cannot supply a handler. */
export interface AgentHandlers {
  readonly order?: (orderId: string) => string;
  readonly returns?: () => string;
}

/** A safe follow-up shared by uncertain, invalid and unavailable decisions. */
export const AGENT_CLARIFICATION =
  'Please clarify: ask about order HB-1042 or our returns policy.';

/**
 * Classifies bounded user text, validates the envelope, and invokes a read-only
 * application handler. Confidence gates routing; it is not calibrated accuracy.
 * Cancellation and unexpected programming failures propagate to the caller.
 */
export async function routeAgent(
  text: string,
  classify: AgentClassifier,
  signal: AbortSignal,
  handlers: AgentHandlers = {},
): Promise<string> {
  signal.throwIfAborted();
  let decision;
  try {
    const response = await classify({
      request: { state: text },
      schema: agentSchema,
      signal,
    });
    signal.throwIfAborted();
    decision = decodeDecision(agentSchema, response);
  } catch (error) {
    signal.throwIfAborted();
    if (
      error instanceof DecisionError ||
      error instanceof DecisionResponseError
    )
      return AGENT_CLARIFICATION;
    throw error;
  }
  const confidence = decision.meta.route.confidence;
  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    confidence < 0.7 ||
    decision.value.route === 'clarify'
  )
    return AGENT_CLARIFICATION;

  if (decision.value.route === 'order') {
    const orderIds = text.match(/\bHB-[A-Z0-9]+\b/gi) ?? [];
    if (orderIds.length !== 1 || orderIds[0] !== 'HB-1042')
      return AGENT_CLARIFICATION;
    signal.throwIfAborted();
    return handlers.order
      ? handlers.order('HB-1042')
      : 'Public example: order HB-1042 has shipped and is due Friday.';
  }

  signal.throwIfAborted();
  return handlers.returns
    ? handlers.returns()
    : 'Public example returns policy: return unused items within 30 days with a receipt.';
}
