import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Chat, s } from '@hashbrownai/core';
import { Observable } from 'rxjs';
import { generateNextMessage } from '@hashbrownai/core';

export const FETCH_GLOBAL = new InjectionToken<typeof fetch>('FETCH_GLOBAL', {
  providedIn: 'root',
  factory: () => window.fetch.bind(window),
});

@Injectable({
  providedIn: 'root',
})
export class FetchService {
  constructor(@Inject(FETCH_GLOBAL) private _fetch: typeof fetch) {}

  streamChatCompletionWithTools(
    url: string,
    request: Chat.CompletionCreateParams,
  ): Observable<Chat.CompletionChunk> {
    return new Observable<Chat.CompletionChunk>((observer) => {
      const abortController = new AbortController();

      (async () => {
        for await (const chunk of generateNextMessage({
          fetchImplementation: this._fetch,
          apiUrl: url,
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          // @todo: add middleware
          middleware: [],
          abortSignal: abortController.signal,
          responseFormat: request.response_format
            ? s.toJsonSchema(request.response_format as s.HashbrownType)
            : undefined,
        })) {
          observer.next(chunk);
        }

        observer.complete();
      })();

      return () => {
        abortController.abort();
      };
    });
  }
}
