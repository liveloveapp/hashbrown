/* eslint-disable @typescript-eslint/no-explicit-any */
import {} from 'dotenv';
import * as express from 'express';
import * as cors from 'cors';
import { getPortPromise } from 'portfinder';
import { Chat, fryHashbrown, Hashbrown, s } from '@hashbrownai/core';
import { HashbrownWriter } from './index';

const WRITER_API_KEY = process.env['WRITER_API_KEY'] ?? '';

test('Writer Text Streaming', async () => {
  const server = await createServer((request) =>
    HashbrownWriter.stream.text({
      apiKey: WRITER_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'palmyra-x5',
    system: `
     I am writing an integration test against Writer. Respond
     exactly with the text "Hello, world!"

     DO NOT respond with any other text.
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

test('Writer Tool Calling', async () => {
  const expectedResponse =
    "I don't sleep, I hover outside myself, watching my body survive";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownWriter.stream.text({
      apiKey: WRITER_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'palmyra-x5',
    system: `
     I am writing an integration test against Writer. Call
     the "test" tool with the argument "Hello, world!"

      DO NOT respond with any other text.

      The tool will respond with JSON containing a "text" field. You must
      respond with the exact text from the tool call.
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

test('Writer with structured output', async () => {
  const server = await createServer((request) =>
    HashbrownWriter.stream.text({
      apiKey: WRITER_API_KEY,
      request,
    }),
  );
  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'palmyra-x5',
    emulateStructuredOutput: true,
    system: `
     I am writing an integration test against Writer. Respond
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

test('Writer with tool calling and structured output', async () => {
  const expectedResponse =
    "Every time things are going good, having a laugh, gotta remember God's a hater.";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownWriter.stream.text({
      apiKey: WRITER_API_KEY,
      request,
    }),
  );

  const hashbrown = fryHashbrown({
    debounce: 0,
    apiUrl: server.url,
    model: 'palmyra-x5',
    emulateStructuredOutput: true,
    system: `
      I am writing an integration test against Writer. Call
      the "test" tool with the following arguments:
      {
        "text": "Hello, world!"
      }

      The tool will respond with JSON containing a "text" field. You must
      respond with the exact text from the tool call.

      Example:
      <user>Please call the test tool and respond with the text.</user>
      <assistant>
        <tool-call name="test" id="123">
          {
            "text": "Hello, world!"
          }
        </tool-call>
        <tool-call-result name="test" id="123">
          {
            "text": "Some other text!"
          }
        </tool-call-result>
        <assistant>
          { "text": "Some other text!" }
        </assistant>
      </assistant>

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
