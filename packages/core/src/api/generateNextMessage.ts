import { Chat, ChatMiddleware } from '../models';
import { s } from '../schema';

/**
 * Asynchronously generates the next message in a chat conversation.
 *
 * This function uses a generator to yield chunks of chat completion data
 * from a specified API. It constructs a request using the provided configuration,
 * sends it to the API, and processes the response in a streaming manner.
 *
 * @param {Object} config - Configuration object for generating the next message.
 * @param {typeof fetch} config.fetchImplementation - The fetch implementation to use for making the API request.
 * @param {string} config.apiUrl - The URL of the API endpoint to send the request to.
 * @param {string} config.model - The model identifier to use for generating the chat completion.
 * @param {Chat.Message[]} config.messages - An array of chat messages to include in the request.
 * @param {Chat.Tool[]} [config.tools] - Optional array of tools to include in the request.
 * @param {number} [config.maxTokens] - Optional maximum number of tokens to generate.
 * @param {number} [config.temperature] - Optional temperature setting for the model.
 * @param {Chat.ResponseFormat} [config.responseFormat] - Optional response format for the chat completion.
 * @param {Array<(requestInit: RequestInit) => RequestInit>} config.middleware - Array of middleware functions to modify the request.
 *
 * @yields {AsyncGenerator<Chat.CompletionChunk>} - An async generator yielding chunks of chat completion data.
 *
 * @throws {Error} - Throws an error if the response is not OK or if the response body is null.
 */
export async function* generateNextMessage(config: {
  fetchImplementation: typeof fetch;
  apiUrl: string;
  model: string;
  messages: Chat.Message[];
  tools?: Chat.Tool[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: s.HashbrownType;
  abortSignal: AbortSignal;
  middleware: ChatMiddleware[];
}): AsyncGenerator<Chat.CompletionChunk> {
  const chatCompletionParams: Chat.CompletionCreateParams = {
    model: config.model,
    messages: config.messages,
    tools: config.tools,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    response_format: config.responseFormat
      ? s.toJsonSchema(config.responseFormat)
      : undefined,
  };

  let requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(chatCompletionParams),
    signal: config.abortSignal,
  };

  for (const middleware of config.middleware) {
    if (config.abortSignal?.aborted) {
      break;
    }

    requestInit = await middleware(requestInit, config.abortSignal);
  }

  const response = await config.fetchImplementation(config.apiUrl, requestInit);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    if (config.abortSignal?.aborted) {
      throw new Error('Abort signal was aborted');
    }

    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });

    try {
      const jsonChunks = chunk.split(/(?<=})(?={)/);

      for (const jsonChunk of jsonChunks) {
        if (jsonChunk.trim()) {
          const jsonData = JSON.parse(jsonChunk) as Chat.CompletionChunk;

          yield jsonData;
        }
      }
    } catch (error) {
      console.error('Error parsing JSON chunk:', error);
    }
  }
}
