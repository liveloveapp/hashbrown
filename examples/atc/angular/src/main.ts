import { createAtcChatTransport } from '@atc/shared';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHashbrown } from '@hashbrownai/angular';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideHashbrown({
      baseUrl: '/api/run',
      transport: () => createAtcChatTransport(),
    }),
  ],
}).catch((error: unknown) => console.error(error));
