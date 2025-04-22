import {
  ApplicationConfig,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
// import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import * as lightApiEffects from './features/lights/effects/light-api.effects';
import * as scenesApiEffects from './features/scenes/effects/scenes-api.effects';
import { reducers } from './store';

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
    provideEffects([lightApiEffects, scenesApiEffects]),
  ],
};
