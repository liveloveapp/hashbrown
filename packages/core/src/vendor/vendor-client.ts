import { Chat } from '../models';

export interface VendorClient {
  stream: {
    text: (
      apiKey: string,
      request: Chat.CompletionCreateParams,
    ) => Chat.CompletionChunkResponse;
  };
}
