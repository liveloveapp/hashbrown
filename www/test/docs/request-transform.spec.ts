import type OpenAI from 'openai';
import { expect, test } from 'vitest';
import { transformSupportRequest } from '../../examples/quickstart/server/request-transform';

const context = {
  workspace: 'Northstar',
  plan: 'Studio',
  responseTime: 'one business day',
};

test('adds trusted workspace instructions without changing provider semantics or mutating options', () => {
  const options: OpenAI.Responses.ResponseCreateParamsStreaming = {
    model: 'gpt-5-mini',
    stream: true,
    store: false,
    input: [
      { role: 'user', content: 'How quickly will our team get support?' },
    ],
    instructions: 'Existing server instruction.',
    tools: [
      {
        type: 'function',
        name: 'lookup',
        description: 'Read a public fact',
        parameters: {},
        strict: true,
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'answer',
        schema: { type: 'object' },
        strict: true,
      },
    },
    reasoning: { effort: 'low' },
    include: ['reasoning.encrypted_content', 'web_search_call.action.sources'],
  };
  const before = structuredClone(options);

  const transformed = transformSupportRequest(options, context);

  expect(transformed).not.toBe(options);
  expect(options).toEqual(before);
  expect(transformed.instructions).toContain('Northstar');
  expect(transformed.instructions).toContain('Studio');
  expect(transformed.instructions).toContain('one business day');
  expect(transformed.instructions).toContain('Existing server instruction.');
  expect({ ...transformed, instructions: options.instructions }).toEqual(
    options,
  );
});
