import { isReasoningModel, resolveReasoning } from './reasoning';

test('isReasoningModel matches o-series and gpt-5 and later, but not chat variants, case-insensitively', () => {
  const table: ReadonlyArray<readonly [string, boolean]> = [
    ['o1', true],
    ['o3-mini', true],
    ['O4-mini', true],
    ['gpt-5', true],
    ['gpt-5-mini', true],
    ['gpt-5.1', true],
    ['gpt-6', true],
    ['gpt-6.1-sol', true],
    ['gpt-10', true],
    ['gpt-5-chat-latest', false],
    ['gpt-5.1-chat-latest', false],
    ['GPT-5-Chat', false],
    ['gpt-4.1', false],
    ['gpt-4o', false],
    ['gpt-4o-mini', false],
    ['omni-moderation', false],
    ['my-deployment', false],
  ];

  const result = table.map(([model]) => [model, isReasoningModel(model)]);

  expect(result).toEqual(table);
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
