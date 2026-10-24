import { expect, test } from 'vitest';
import { selectAgentModes } from '../src/tools/docs-agent-decisions-fixtures';

test('selects both agent recordings by default', () => {
  const selected = selectAgentModes(undefined);

  expect(selected).toEqual(['agent-routing', 'agent-fallback']);
});

test('selects requested agent recordings in catalog order', () => {
  const selected = selectAgentModes('agent-fallback,agent-routing');

  expect(selected).toEqual(['agent-routing', 'agent-fallback']);
});

test('rejects unknown recording modes before replacing assets', () => {
  const select = () => selectAgentModes('agent-routing,typo');

  expect(select).toThrow('Unknown docs agent mode');
});

test('describes classifier fixtures through the checked server in the agent transcript', async () => {
  const { createRecipeTranscript } =
    await import('../src/tools/docs-recipe-video');

  const transcript = createRecipeTranscript(
    'agent-routing',
    'Route the order question, then the returns question.',
    'Checked Express agent/router with scripted classifier envelopes and errors; presentation styles added; no live model or narration.',
  );

  expect(transcript).toContain('Checked Express agent/router');
  expect(transcript).toContain('Route the order question');
  expect(transcript).not.toContain('Scripted AG-UI');
});

test('builds a classifier envelope without injecting a final reply', async () => {
  const { createAgentEnvelope } =
    await import('../src/tools/docs-agent-decisions-fixtures');

  const envelope = createAgentEnvelope('returns', 0.9);

  expect(envelope).toMatchObject({
    kind: 'hashbrown.decision',
    version: 1,
    value: { route: 'returns' },
    meta: { route: { confidence: 0.9 } },
  });
  expect(envelope.meta.route.probabilities.returns).toBe(0.9);
  expect(Object.keys(envelope.value)).toEqual(['route']);
});
