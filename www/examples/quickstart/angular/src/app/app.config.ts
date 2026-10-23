import {
  type ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHashbrown } from '@hashbrownai/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHashbrown({ baseUrl: '/api/chat' }),
  ],
};
