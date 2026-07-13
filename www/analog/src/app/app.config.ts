import {
  injectContentFiles,
  provideContent,
  withMarkdownRenderer,
} from '@analogjs/content';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';
import {
  provideFileRouter,
  requestContextInterceptor,
  withExtraRoutes,
} from '@analogjs/router';
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
  ActivatedRouteSnapshot,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHashbrown } from '@hashbrownai/angular';
import { provideMarkdown } from 'ngx-markdown';
import { PostAttributes } from './models/blog.models';
import { HighlighterService } from './services/HighlighterService';

const blogTitle = 'Home: Hashbrown Blog';

function getBlogPostTitle(route: ActivatedRouteSnapshot) {
  const content = injectContentFiles<PostAttributes>().find(
    (contentFile) =>
      contentFile.filename === `/src/content/blog/${route.params['slug']}.md` ||
      contentFile.slug === route.params['slug'],
  );

  return content?.attributes.title ?? blogTitle;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideFileRouter(
      withExtraRoutes([
        {
          path: 'blog',
          title: blogTitle,
          loadComponent: () => import('./pages/blog.page'),
          children: [
            {
              path: '',
              title: blogTitle,
              loadComponent: () => import('./pages/blog/index.page'),
            },
            {
              path: ':slug',
              title: getBlogPostTitle,
              loadComponent: () => import('./pages/blog/[slug].page'),
            },
          ],
        },
      ]),
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
    provideHashbrown({
      baseUrl: '/_/chat',
    }),
  ],
};
