import type { RunAgentInput } from '@ag-ui/core';
import { FunctionCallingConfigMode } from '@google/genai';
import { createGoogleRequestOptions } from './google-request';

function createInput(): RunAgentInput & {
  hashbrown: { responseSchema: object };
} {
  return {
    threadId: 'thread-google',
    runId: 'run-google',
    messages: [
      { id: 'system-google', role: 'system', content: 'System prompt.' },
      {
        id: 'developer-google',
        role: 'developer',
        content: 'Developer prompt.',
      },
      { id: 'user-google', role: 'user', content: 'Look it up.' },
      {
        id: 'reasoning-google',
        role: 'reasoning',
        content: 'I need a lookup.',
        encryptedValue: 'reasoning-signature',
        metadata: { google: { thought: true } },
      },
      {
        id: 'assistant-google',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-google',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"hashbrown"}',
            },
            encryptedValue: 'tool-signature',
            metadata: { google: { functionCall: true } },
          },
        ],
      },
      {
        id: 'tool-google',
        role: 'tool',
        toolCallId: 'call-google',
        content: '{"result":"fixture"}',
      },
    ],
    tools: [
      {
        name: 'lookup',
        description: 'Lookup a value.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    },
  };
}

test('maps AG-UI messages, tools, signatures, and structured output to Google', () => {
  const controller = new AbortController();
  const input = createInput();

  const result = createGoogleRequestOptions(
    input,
    'gemini-3-flash',
    controller.signal,
  );

  expect(result).toEqual({
    model: 'gemini-3-flash',
    contents: [
      { role: 'user', parts: [{ text: 'Look it up.' }] },
      {
        role: 'model',
        parts: [
          {
            text: 'I need a lookup.',
            thought: true,
            thoughtSignature: 'reasoning-signature',
          },
          {
            functionCall: {
              id: 'call-google',
              name: 'lookup',
              args: { query: 'hashbrown' },
            },
            thoughtSignature: 'tool-signature',
          },
          { text: 'Checking.' },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-google',
              name: 'lookup',
              response: { result: 'fixture' },
            },
          },
        ],
      },
    ],
    config: {
      abortSignal: controller.signal,
      systemInstruction: {
        parts: [{ text: 'System prompt.' }, { text: 'Developer prompt.' }],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'lookup',
              description: 'Lookup a value.',
              parametersJsonSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
      },
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    },
  });
});
