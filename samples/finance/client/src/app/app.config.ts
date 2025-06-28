import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHashbrown } from '@hashbrownai/angular';
import { appRoutes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideAnimations(),
    provideHashbrown({
      baseUrl: '/api/chat',
      emulateStructuredOutput: true,
      middleware: [
        function (request: RequestInit) {
          return request;
        },
      ],
    }),
  ],
};
