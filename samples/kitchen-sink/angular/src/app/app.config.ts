import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideMarkdown } from 'ngx-markdown';
// import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import * as lightApiEffects from './features/lights/effects/light-api.effects';
import * as scenesApiEffects from './features/scenes/effects/scenes-api.effects';
import * as scheduledScenesApiEffects from './pages/scheduled-scenes/effects/scheduled-scenes-api.effects';
import * as dashboardEffects from './features/dashboard/effects/dashboard.effects';
import { reducers } from './store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
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
      dashboardEffects,
    ]),
    provideMarkdown(),
    provideHashbrown({
      baseUrl: 'http://localhost:3000/chat',
      middleware: [
        function (request: RequestInit) {
          return request;
        },
      ],
    }),
    provideNativeDateAdapter(),
  ],
};
