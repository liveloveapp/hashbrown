import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Chat } from '@hashbrownai/core';
import { Observable } from 'rxjs';

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

      const fetchData = async () => {
        try {
          const response = await this._fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
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
              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            try {
              // Split the chunk by JSON objects and process each one
              const jsonChunks = chunk.split(/(?<=})(?={)/);

              for (const jsonChunk of jsonChunks) {
                if (jsonChunk.trim()) {
                  const jsonData = JSON.parse(
                    jsonChunk,
                  ) as Chat.CompletionChunk;
                  observer.next(jsonData);
                }
              }
            } catch (error) {
              console.error('Error parsing JSON chunk:', error);
            }
          }

          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      };

      fetchData();

      return () => {
        abortController.abort();
      };
    });
  }
}
