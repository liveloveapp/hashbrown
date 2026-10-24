/** The two checked server-agent recordings. */
export type AgentMode = 'agent-routing' | 'agent-fallback';

/** Selects requested recording modes, rejecting unknown IDs. */
export function selectAgentModes(requested: string | undefined): AgentMode[] {
  const modes: AgentMode[] = ['agent-routing', 'agent-fallback'];
  const selected = requested?.split(',');
  if (selected?.some((mode) => !modes.includes(mode as AgentMode)))
    throw new Error('Unknown docs agent mode');
  return modes.filter((mode) => !selected || selected.includes(mode));
}

/** Builds classifier data only; the checked server owns every final reply. */
export function createAgentEnvelope(
  route: 'order' | 'returns' | 'clarify',
  confidence = 0.95,
) {
  const routes = ['order', 'returns', 'clarify'];
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { route },
    meta: {
      route: {
        confidence,
        probabilities: Object.fromEntries(
          routes.map((candidate) => [
            candidate,
            candidate === route ? confidence : (1 - confidence) / 2,
          ]),
        ),
      },
    },
  };
}
