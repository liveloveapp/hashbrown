import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideMarkdown } from 'ngx-markdown';
import { HighlighterService } from './services/HighlighterService';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideFileRouter(
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),
    provideClientHydration(),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideAnimations(),
    provideContent(withMarkdownRenderer()),
    provideAppInitializer(() => {
      const highlighterService = inject(HighlighterService);
      highlighterService.loadHighlighter();
    }),
    provideMarkdown(),
    provideHashbrown({
      baseUrl: '/_/chat',
    }),
  ],
};
