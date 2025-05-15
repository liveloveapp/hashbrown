import { ApplicationConfig } from '@angular/core';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideMarkdown } from 'ngx-markdown';
import { getApiKey, getProvider } from './utils/config.util';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMarkdown(),
    provideHashbrown({
      baseUrl: '/api/chat',
      middleware: [
        function (request: RequestInit) {
          return {
            ...request,
            headers: {
              ...request.headers,
              'x-hashbrown': JSON.stringify({
                provider: getProvider(),
                apiKey: getApiKey(),
              }),
            },
          };
        },
      ],
    }),
  ],
};
