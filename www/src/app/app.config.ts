import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';
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
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { HighlighterService } from './services/HighlighterService';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
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
    provideContent(withMarkdownRenderer(), withShikiHighlighter()),
    provideAppInitializer(() => {
      const highlighterService = inject(HighlighterService);
      return highlighterService.loadHighlighter();
    }),
    provideMarkdown(),
  ],
};
