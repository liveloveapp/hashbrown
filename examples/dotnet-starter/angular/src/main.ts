import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHashbrown } from '@hashbrownai/angular';
import { App } from './app';
import '../../shared/styles.css';
bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideHashbrown({ baseUrl: '/run' }),
  ],
}).catch((error: unknown) => {
  throw error;
});
