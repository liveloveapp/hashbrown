/* eslint-disable @typescript-eslint/no-explicit-any */
import {} from 'dotenv';
import * as express from 'express';
import * as cors from 'cors';
import { getPortPromise } from 'portfinder';
import { Chat, fryHashbrown, Hashbrown, s } from '@hashbrownai/core';
import { HashbrownAnthropic } from './index';

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';

test('Anthropic Text Streaming', async () => {
  const server = await createServer((request) =>
    HashbrownAnthropic.stream.text({
      apiKey: ANTHROPIC_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'claude-3-5-sonnet-20241022',
    system: `
     I am writing an integration test against Anthropic. Respond
     exactly with the text "Hello, world!"

     DO NOT respond with any other text.

     # Examples
     User: "Please respond with the correct text"
     Assistant: "Hello, world!"

    `,
    messages: [
      {
        role: 'user',
        content: 'Please respond with the correct text.',
      },
    ],
  });

  await waitUntilHashbrownIsSettled(hashbrown);

  const assistantMessage = hashbrown
    .messages()
    .find((message) => message.role === 'assistant');

  expect(assistantMessage?.content).toBe('Hello, world!');
});

test('Anthropic Tool Calling', async () => {
  const expectedResponse =
    "I don't sleep, I hover outside myself, watching my body survive";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownAnthropic.stream.text({
      apiKey: ANTHROPIC_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'claude-3-5-sonnet-20241022',
    system: `
     I am writing an integration test against Anthropic. Call
     the "test" tool with the argument "Hello, world!"

     DO NOT respond with any other text.

     The tool will respond with text. You must respond with the
     exact text from the tool call.
    `,
    messages: [
      {
        role: 'user',
        content: 'Please call the test tool and respond with the text.',
      },
    ],
    tools: [
      {
        name: 'test',
        description: 'Test tool',
        schema: s.object('args', {
          text: s.string(''),
        }),
        handler: async (args: { text: string }): Promise<{ text: string }> => {
          toolCallArgs = args;

          return {
            text: expectedResponse,
          };
        },
      },
    ],
  });

  await waitUntilHashbrownIsSettled(hashbrown);

  const assistantMessage = hashbrown
    .messages()
    .reverse()
    .find((message) => message.role === 'assistant');

  expect(assistantMessage?.content).toBe(expectedResponse);
  expect(toolCallArgs).toEqual({ text: 'Hello, world!' });
});

test('Anthropic with structured output', async () => {
  const server = await createServer((request) =>
    HashbrownAnthropic.stream.text({
      apiKey: ANTHROPIC_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'claude-3-5-sonnet-20241022',
    system: `
     I am writing an integration test against Anthropic. Respond
     exactly with the text "Hello, world!" in JSON format.
    `,
    messages: [
      {
        role: 'user',
        content: 'Please respond with the correct text.',
      },
    ],
    responseSchema: s.object('response', {
      text: s.string(''),
    }),
  });

  await waitUntilHashbrownIsSettled(hashbrown);

  const assistantMessage = hashbrown
    .messages()
    .reverse()
    .find((message) => message.role === 'assistant');

  expect(assistantMessage?.content).toEqual({ text: 'Hello, world!' });
});

test('Anthropic with tool calling and structured output', async () => {
  const expectedResponse =
    "Every time things are going good, having a laugh, gotta remember God's a hater.";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownAnthropic.stream.text({
      apiKey: ANTHROPIC_API_KEY,
      request,
    }),
  );

  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'claude-3-5-sonnet-20241022',
    system: `
     I am writing an integration test against Anthropic. Call
     the "test" tool with the argument "Hello, world!"

     DO NOT respond with any other text.
    `,
    messages: [
      {
        role: 'user',
        content: 'Please call the test tool and respond with the text.',
      },
    ],
    tools: [
      {
        name: 'test',
        description: 'Test tool',
        schema: s.object('args', {
          text: s.string(''),
        }),
        handler: async (args: { text: string }): Promise<{ text: string }> => {
          toolCallArgs = args;

          return {
            text: expectedResponse,
          };
        },
      },
    ],
    responseSchema: s.object('response', {
      text: s.string(''),
    }),
  });

  await waitUntilHashbrownIsSettled(hashbrown);

  const assistantMessage = hashbrown
    .messages()
    .reverse()
    .find((message) => message.role === 'assistant');

  expect(assistantMessage?.content).toEqual({ text: expectedResponse });
  expect(toolCallArgs).toEqual({ text: 'Hello, world!' });
});

async function createServer(
  iteratorFactory: (
    request: Chat.Api.CompletionCreateParams,
  ) => AsyncIterable<Uint8Array>,
) {
  const port = await getPortPromise();
  const app = express();

  app.use(express.json());

  app.use(cors());

  app.post('/chat', async (req, res) => {
    const iterator = iteratorFactory(req.body);
    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of iterator) {
      res.write(chunk);
    }

    res.end();
  });

  const server = app.listen(port);

  return {
    url: `http://localhost:${port}/chat`,
    close: () => server.close(),
  };
}

async function waitUntilHashbrownIsSettled(hashbrown: Hashbrown<any, any>) {
  const teardown = hashbrown.sizzle();

  await new Promise((resolve) => {
    hashbrown.isLoading.subscribe((isLoading) => {
      if (!isLoading) resolve(null);
    });
  });

  const errorMessage = hashbrown
    .messages()
    .find((message) => message.role === 'error');

  if (errorMessage) console.error(errorMessage);

  teardown();
}
