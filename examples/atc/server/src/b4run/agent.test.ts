import { SYSTEM_PROMPT } from '@atc/shared';
import { expect, test } from 'vitest';
import { createAtcAgent } from './agent';

test('the agent descriptor pins the prompt, output cap and bounded execution', () => {
  const descriptor = createAtcAgent({
    model: 'gpt-5-mini',
    reasoningEffort: 'low',
  });

  expect(descriptor).toMatchObject({
    model: 'gpt-5-mini',
    provider: 'openai',
    systemPrompt: SYSTEM_PROMPT,
    maxOutputTokens: 4096,
    recursionLimit: 32,
    delegation: { default: 'deny' },
    reasoning: { openai: { effort: 'low', summary: 'auto' } },
    tools: { allow: [] },
  });
});

test('non-reasoning models and an explicit empty effort omit reasoning configuration', () => {
  const descriptors = [
    createAtcAgent({ model: 'gpt-4.1', reasoningEffort: 'low' }),
    createAtcAgent({ model: 'gpt-5-chat-latest', reasoningEffort: 'low' }),
    createAtcAgent({ model: 'gpt-5-mini', reasoningEffort: null }),
  ];

  descriptors.forEach((descriptor) =>
    expect(descriptor.reasoning).toBeUndefined(),
  );
});

test('unsupported b4.run reasoning effort fails clearly instead of changing model settings', () => {
  const create = () =>
    createAtcAgent({ model: 'gpt-5-mini', reasoningEffort: 'max' });

  expect(create).toThrow('OPENAI_REASONING_EFFORT');
});
