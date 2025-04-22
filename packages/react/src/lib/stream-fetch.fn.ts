import { Chat } from '@hashbrownai/core';

export interface StreamChatCompletionCallbacks {
  onChunk: (chunk: Chat.CompletionChunk) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export interface StreamChatCompletionOptions {
  url: string;
  headers?: Record<string, string>;
  request: Chat.CompletionCreateParams;
  callbacks: StreamChatCompletionCallbacks;
}

export type StreamChatCompletionCleanup = () => void;

export const streamChatCompletionWithTools = (
  streamChatCompletionOptions: StreamChatCompletionOptions,
): StreamChatCompletionCleanup => {
  const { url, headers, request, callbacks } = streamChatCompletionOptions;

  const abortController = new AbortController();

  const fetchData = async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Call onComplete when the stream is finished
          if (callbacks.onComplete) {
            callbacks.onComplete();
          }
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // @todo U.G. Wilson - Make sure calling abort is the only way this can happen.
        // If not, need to decide when to stop it (user aborts) and when to let the
        // error through.
        if (callbacks.onComplete) {
          callbacks.onComplete();
        }
      } else {
        callbacks.onError(error as Error);
      }
    }
  };

  fetchData();

  // Return cleanup function
  return () => {
    abortController.abort();
  };
};
