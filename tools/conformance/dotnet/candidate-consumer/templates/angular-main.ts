import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHashbrown } from '@hashbrownai/angular';
import { App } from './app';
import { CandidateFrameworkErrors } from './angular/panel';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    CandidateFrameworkErrors,
    { provide: ErrorHandler, useExisting: CandidateFrameworkErrors },
    provideHashbrown({ baseUrl: '/run' }),
  ],
}).catch((error: unknown) => {
  throw error;
});
