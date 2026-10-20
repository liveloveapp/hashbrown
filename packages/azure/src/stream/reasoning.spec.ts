import { isReasoningModel, resolveReasoning } from './reasoning';

test('isReasoningModel matches o-series and gpt-5 and later, case-insensitively', () => {
  const models = [
    'o1',
    'o3-mini',
    'O4-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5.1',
    'gpt-6',
    'gpt-6.1-sol',
    'gpt-10',
    'gpt-4.1',
    'gpt-4o',
    'gpt-4o-mini',
    'omni-moderation',
    'my-deployment',
  ];

  const result = models.map(isReasoningModel);

  expect(result).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
});

test('resolveReasoning requests auto summaries for reasoning models when unset', () => {
  const reasoningModel = resolveReasoning('gpt-5-mini', undefined);
  const otherModel = resolveReasoning('gpt-4.1', undefined);

  expect(reasoningModel).toEqual({ summary: 'auto' });
  expect(otherModel).toBeUndefined();
});

test('resolveReasoning sends nothing when the option is false', () => {
  const result = resolveReasoning('gpt-5-mini', false);

  expect(result).toBeUndefined();
});

test('resolveReasoning sends an object as given and fills only a missing summary', () => {
  const filled = resolveReasoning('gpt-4.1', { effort: 'low' });
  const nullSummary = resolveReasoning('gpt-5', { summary: null });
  const explicit = resolveReasoning('gpt-5', {
    effort: 'high',
    summary: 'detailed',
  });

  expect(filled).toEqual({ effort: 'low', summary: 'auto' });
  expect(nullSummary).toEqual({ summary: null });
  expect(explicit).toEqual({ effort: 'high', summary: 'detailed' });
});
