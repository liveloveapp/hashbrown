import {
  ApplicationConfig,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideMarkdown } from 'ngx-markdown';
// import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import * as lightApiEffects from './features/lights/effects/light-api.effects';
import * as scenesApiEffects from './features/scenes/effects/scenes-api.effects';
import * as scheduledScenesApiEffects from './pages/scheduled-scenes/effects/scheduled-scenes-api.effects';
import { reducers } from './store';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideNativeDateAdapter } from '@angular/material/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimations(),
    provideStore(reducers),
    // provideStoreDevtools({
    //   maxAge: 25,
    //   autoPause: true,
    // }),
    provideEffects([
      lightApiEffects,
      scenesApiEffects,
      scheduledScenesApiEffects,
    ]),
    provideMarkdown(),
    provideHashbrown({
      baseUrl: 'http://localhost:3000/chat',
      middleware: [
        function (request) {
          return {
            ...request,
            headers: {
              ...request.headers,
              'x-hashbrown': JSON.stringify({
                provider: 'openai',
                apiKey: 'sk-',
              }),
            },
          };
        },
      ],
    }),
    provideNativeDateAdapter(),
  ],
};
