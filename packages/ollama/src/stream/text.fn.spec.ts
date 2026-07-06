import OllamaClient, { Ollama } from 'ollama';
import { Chat } from '@hashbrownai/core';
import { text } from './text.fn';

jest.mock('ollama', () => {
  const defaultClient = {
    chat: jest.fn(),
  };

  return {
    __esModule: true,
    default: defaultClient,
    Ollama: jest.fn(),
  };
});

const MockedOllama = jest.mocked(Ollama);
const mockedDefaultClient = jest.mocked(OllamaClient);

test('uses the default Ollama client when no client options are provided', async () => {
  resetOllamaMocks();
  const defaultChat = jest.fn().mockResolvedValue(createOllamaStream());
  mockedDefaultClient.chat = defaultChat;
  const request = createRequest();

  await consumeStream(
    text({
      request,
    }),
  );

  expect(defaultChat).toHaveBeenCalledWith(
    expect.objectContaining({
      model: request.model,
      stream: true,
    }),
  );
  expect(MockedOllama).not.toHaveBeenCalled();
});

test('creates an Ollama client with the configured host', async () => {
  resetOllamaMocks();
  const chat = jest.fn().mockResolvedValue(createOllamaStream());
  MockedOllama.mockImplementationOnce(() => ({ chat }) as unknown as Ollama);
  const request = createRequest();

  await consumeStream(
    text({
      host: 'http://ollama:11434',
      request,
    }),
  );

  expect(MockedOllama).toHaveBeenCalledWith({
    host: 'http://ollama:11434',
  });
  expect(chat).toHaveBeenCalledWith(
    expect.objectContaining({
      model: request.model,
      stream: true,
    }),
  );
});

test('uses an explicit Ollama client when provided', async () => {
  resetOllamaMocks();
  const chat = jest.fn().mockResolvedValue(createOllamaStream());
  const client = { chat } as unknown as Ollama;
  const request = createRequest();

  await consumeStream(
    text({
      client,
      host: 'http://ollama:11434',
      turbo: { apiKey: 'test-api-key' },
      request,
    }),
  );

  expect(chat).toHaveBeenCalledWith(
    expect.objectContaining({
      model: request.model,
      stream: true,
    }),
  );
  expect(MockedOllama).not.toHaveBeenCalled();
});

test('creates an Ollama Turbo client before the configured host when turbo is provided', async () => {
  resetOllamaMocks();
  const chat = jest.fn().mockResolvedValue(createOllamaStream());
  MockedOllama.mockImplementationOnce(() => ({ chat }) as unknown as Ollama);
  const request = createRequest();

  await consumeStream(
    text({
      host: 'http://ollama:11434',
      turbo: { apiKey: 'test-api-key' },
      request,
    }),
  );

  expect(MockedOllama).toHaveBeenCalledWith({
    host: 'https://ollama.com',
    headers: {
      Authorization: 'Bearer test-api-key',
    },
  });
  expect(chat).toHaveBeenCalledWith(
    expect.objectContaining({
      model: request.model,
      stream: true,
    }),
  );
});

test('passes transformed request options to the selected client', async () => {
  resetOllamaMocks();
  const chat = jest.fn().mockResolvedValue(createOllamaStream());
  mockedDefaultClient.chat = chat;

  await consumeStream(
    text({
      request: createRequest(),
      transformRequestOptions: (options) => ({
        ...options,
        options: {
          temperature: 0,
        },
      }),
    }),
  );

  expect(chat).toHaveBeenCalledWith(
    expect.objectContaining({
      options: {
        temperature: 0,
      },
    }),
  );
});

async function consumeStream(stream: AsyncIterable<Uint8Array>): Promise<void> {
  for await (const chunk of stream) {
    void chunk;
    // Consume the stream so client selection and chat execution happen.
  }
}

function resetOllamaMocks(): void {
  MockedOllama.mockReset();
  mockedDefaultClient.chat = jest.fn().mockResolvedValue(createOllamaStream());
}

function createRequest(): Chat.Api.CompletionCreateParams {
  return {
    operation: 'generate',
    model: 'llama3.2',
    system: 'Respond tersely.',
    messages: [
      {
        role: 'user',
        content: 'Hello',
      },
    ],
  };
}

async function* createOllamaStream() {
  yield {
    done: false,
    message: {
      role: 'assistant',
      content: 'Hello',
    },
  };

  yield {
    done: true,
    message: {
      role: 'assistant',
      content: '',
    },
  };
}
