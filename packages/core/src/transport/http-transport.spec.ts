import { HttpTransport } from './http-transport';
import { TransportError } from './transport-error';
import { Chat } from '../models';

const defaultParams: Chat.Api.CompletionCreateParams = {
  model: '' as Chat.Api.CompletionCreateParams['model'],
  system: '',
  messages: [],
};

test('applies middleware before issuing fetch', async () => {
  const fetchMock = jest.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array());
            controller.close();
          },
        }),
        { status: 200 },
      ),
  );

  const transport = new HttpTransport({
    baseUrl: 'https://example.com/chat',
    middleware: [
      async (init) => ({
        ...init,
        headers: {
          ...init.headers,
          'x-test': 'first',
        },
      }),
      (init) => ({
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          'x-test-2': 'second',
        },
      }),
    ],
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  await transport.send({
    params: defaultParams,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'test',
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.com/chat',
    expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-test': 'first',
        'x-test-2': 'second',
      }),
    }),
  );
});

test('throws TransportError on HTTP failure', async () => {
  const fetchMock = jest.fn(
    async () => new Response(null, { status: 500, statusText: 'boom' }),
  );

  const transport = new HttpTransport({
    baseUrl: 'https://example.com/chat',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });

  const sendPromise = transport.send({
    params: defaultParams,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'test',
  });

  await expect(sendPromise).rejects.toBeInstanceOf(TransportError);
});
