import { bootstrapApplication } from '@angular/platform-browser';
import {
  mergeApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { App } from './app/app.component';
import { appConfig } from './app/app.config';

const config = mergeApplicationConfig(appConfig, {
  providers: [provideZonelessChangeDetection()],
});

bootstrapApplication(App, config);
