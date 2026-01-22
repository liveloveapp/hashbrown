/* eslint-disable @typescript-eslint/no-explicit-any */
import {} from 'dotenv';
import * as express from 'express';
import * as cors from 'cors';
import { Chat, fryHashbrown, Hashbrown, s } from '@hashbrownai/core';
import { HashbrownGoogle } from './index';

const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'] ?? '';

jest.setTimeout(60_000);

test('Google Text Streaming', async () => {
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );
  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-2.5-flash',
      system: `
     I am writing an integration test against Google. Respond
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
  } finally {
    server.close();
  }
});

test('Google Tool Calling', async () => {
  const expectedResponse =
    "I don't sleep, I hover outside myself, watching my body survive";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );
  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-2.5-flash',
      system: `
     I am writing an integration test against Google. Call
     the "test" tool with the argument "Hello, world!"

     DO NOT respond with any other text.

     The tool will respond with text. You must respond with the
     exact text from the tool call.

     # Example
     User: Please call the test tool and respond with the text.
     [tool_call] "test"
      {
        "text": "It's not the heat, it's the dust"
      }
     Assistant: It's not the heat, it's the dust
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
          handler: async (args: {
            text: string;
          }): Promise<{ text: string }> => {
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
  } finally {
    server.close();
  }
});

test('Google with structured output', async () => {
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );
  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-2.5-flash',
      system: `
     I am writing an integration test against Google. Respond
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
  } finally {
    server.close();
  }
});

test('Google with tool calling and structured output', async () => {
  const expectedResponse =
    "Every time things are going good, having a laugh, gotta remember God's a hater";
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );

  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-2.5-flash',
      emulateStructuredOutput: true,
      system: `
     I am writing an integration test against Google. Call
     the "test" tool with the argument "Hello, world!"

     Respond with JSON that matches {"text": string} using the tool's response.
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
          handler: async (args: {
            text: string;
          }): Promise<{ text: string }> => {
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
  } finally {
    server.close();
  }
});

test('Google with tool calling and structured output (gemini-3-flash-preview)', async () => {
  const expectedResponse = 'The proof is in the pudding';
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );

  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-3-flash-preview',
      system: `
     I am writing an integration test against Google. Call
     the "test" tool with the argument "Hello, world!"

     Respond with JSON that matches {"text": string} using the tool's response.
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
          handler: async (args: {
            text: string;
          }): Promise<{ text: string }> => {
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
  } finally {
    server.close();
  }
});

test('Google with tool calling and structured output (gemini-3-pro-preview)', async () => {
  const expectedResponse = 'Measure twice, cut once';
  let toolCallArgs: any;
  const server = await createServer((request) =>
    HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request,
    }),
  );

  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-3-pro-preview',
      system: `
     I am writing an integration test against Google. Call
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
          handler: async (args: {
            text: string;
          }): Promise<{ text: string }> => {
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
  } finally {
    server.close();
  }
});

test('Google supports thread IDs across turns', async () => {
  const requests: Chat.Api.CompletionCreateParams[] = [];
  const threadMessages = new Map<string, Chat.Api.Message[]>();
  const server = await createServer((incomingRequest) => {
    requests.push(incomingRequest);

    const iterator = HashbrownGoogle.stream.text({
      apiKey: GOOGLE_API_KEY,
      request: incomingRequest,
      loadThread: async (threadId: string) => {
        return threadMessages.get(threadId) ?? [];
      },
      saveThread: async (thread: Chat.Api.Message[], threadId?: string) => {
        const id = threadId ?? incomingRequest.threadId ?? 'google-thread';
        threadMessages.set(id, thread);
        return id;
      },
    });

    return iterator;
  });

  let teardown: (() => void) | undefined;
  try {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: 'gemini-2.5-flash',
      system: `
     You are participating in a deterministic integration test.

     Rules:
     1. When the user sends a message that starts with "Store this value:", respond with "Stored".
     2. When the user later sends a message that is exactly "Recall value", respond with the value that appeared after "Store this value:" in the most recent earlier user message. Respond with the value alone.
     3. For any other message, respond with "Unexpected input".
    `,
      messages: [
        {
          role: 'user',
          content: 'Store this value: 12345',
        },
      ],
      threadId: 'google-thread',
    });

    teardown = hashbrown.sizzle();

    await waitForNextIdle(hashbrown);

    const firstAssistant = hashbrown
      .messages()
      .find((message) => message.role === 'assistant');

    expect(firstAssistant?.content).toBe('Stored');

    hashbrown.sendMessage({
      role: 'user',
      content: 'Recall value',
    });

    await waitForNextIdle(hashbrown);

    expect(requests).toHaveLength(2);
    const [initialRequest, followupRequest] = requests;

    expect(initialRequest.threadId).toBeDefined();
    expect(followupRequest.threadId).toBe(initialRequest.threadId);
    expect(initialRequest.messages).toEqual([
      {
        role: 'user',
        content: 'Store this value: 12345',
      },
    ]);
    expect(followupRequest.messages).toEqual([
      {
        role: 'user',
        content: 'Recall value',
      },
    ]);
    const savedThread =
      threadMessages.get(initialRequest.threadId as string) ?? [];
    const savedContents = savedThread.map((m) => m.content);
    expect(savedContents).toContain('Store this value: 12345');
    expect(savedContents.some((c) => c === 'Stored')).toBeTruthy();
    expect(hashbrown.threadId()).toBe(initialRequest.threadId);
  } finally {
    teardown?.();
    server.close();
  }
});

async function createServer(
  iteratorFactory: (
    request: Chat.Api.CompletionCreateParams,
  ) => AsyncIterable<Uint8Array>,
) {
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

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to determine server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}/chat`,
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

async function waitForNextIdle(hashbrown: Hashbrown<any, any>) {
  await new Promise((resolve) => {
    hashbrown.isLoading.subscribe((isLoading) => {
      if (!isLoading) resolve(null);
    });
  });

  const errorMessage = hashbrown
    .messages()
    .find((message) => message.role === 'error');

  if (errorMessage) console.error(errorMessage);
}
