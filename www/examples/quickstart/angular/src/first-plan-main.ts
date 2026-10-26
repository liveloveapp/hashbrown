import { bootstrapApplication } from '@angular/platform-browser';
import { FirstPlanApp } from './app/first-plan-app';
import { appConfig } from './app/app.config';

bootstrapApplication(FirstPlanApp, appConfig).catch(console.error);
