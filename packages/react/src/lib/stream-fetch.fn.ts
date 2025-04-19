import { Chat } from '@hashbrownai/core';

export interface StreamChatCompletionCallbacks {
  onChunk: (chunk: Chat.CompletionChunk) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export interface StreamChatCompletionOptions {
  url: string;
  request: Chat.CompletionCreateParams;
  callbacks: StreamChatCompletionCallbacks;
}

export type StreamChatCompletionCleanup = () => void;

export const streamChatCompletionWithTools = (
  streamChatCompletionOptions: StreamChatCompletionOptions,
): StreamChatCompletionCleanup => {
  const { url, request, callbacks } = streamChatCompletionOptions;

  const abortController = new AbortController();

  const fetchData = async () => {
    try {
      console.log('fetching data');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      console.log('fetching data 2');

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      console.log('fetching data 3');

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        try {
          // Split the chunk by JSON objects and process each one
          const jsonChunks = chunk.split(/(?<=})(?={)/);

          for (const jsonChunk of jsonChunks) {
            if (jsonChunk.trim()) {
              const jsonData = JSON.parse(jsonChunk) as Chat.CompletionChunk;
              callbacks.onChunk(jsonData);
            }
          }
        } catch (error) {
          console.error('Error parsing JSON chunk:', error);
        }
      }

      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error as Error);
    }
  };

  fetchData();

  // Return cleanup function
  return () => {
    abortController.abort();
  };
};
