import { Chat } from '../models';

export interface VendorClient {
  stream: {
    text: (
      apiKey: string,
      request: Chat.Api.CompletionCreateParams,
    ) => AsyncIterable<Chat.Api.CompletionChunk>;
  };
}
