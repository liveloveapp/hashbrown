import { ApplicationConfig, inject } from '@angular/core';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideMarkdown } from 'ngx-markdown';
import { ConfigStore } from './store/config.store';

export const appConfig: ApplicationConfig = {
  providers: [
    ConfigStore,
    provideMarkdown(),
    provideHashbrown({
      baseUrl: '/api/chat',
      middleware: [
        function (request: RequestInit) {
          const configStore = inject(ConfigStore);
          return {
            ...request,
            headers: {
              ...request.headers,
              'x-hashbrown': JSON.stringify({
                provider: configStore.provider(),
                apiKey: configStore.apiKey(),
              }),
            },
          };
        },
      ],
    }),
  ],
};
