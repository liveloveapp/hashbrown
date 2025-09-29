import {
  injectContent,
  injectContentFiles,
  MarkdownComponent,
} from '@analogjs/content';
import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot } from '@angular/router';
import { WorkshopAttributes } from '../../models/workshop.models';

export const routeMeta: RouteMeta = {
  title: (route: ActivatedRouteSnapshot) => {
    const content = injectContentFiles<WorkshopAttributes>().find(
      (contentFile) =>
        contentFile.filename ===
          `/src/content/workshops/${route.params['slug']}.md` ||
        contentFile.slug === route.params['slug'],
    );
    if (!content) {
      return 'Hashbrown Workshops';
    }
    return `${content.attributes.title}: Hashbrown AI Workshops`;
  },
  meta: (route: ActivatedRouteSnapshot) => {
    const content = injectContentFiles<WorkshopAttributes>().find(
      (contentFile) =>
        contentFile.filename ===
          `/src/content/workshops/${route.params['slug']}.md` ||
        contentFile.slug === route.params['slug'],
    );
    if (!content) {
      return [];
    }
    return [
      {
        name: 'og:title',
        content: `${content.attributes.title}: Hashbrown AI Workshops`,
      },
      {
        name: 'og:description',
        content: content.attributes.description,
      },
      {
        name: 'og:image',
        content:
          content.attributes.ogImage ??
          'https://hashbrown.dev/image/meta/og-default.png',
      },
    ];
  },
};

@Component({
  imports: [MarkdownComponent],
  template: `
    <article>
      @if (post(); as p) {
        <analog-markdown [content]="p.content"></analog-markdown>
      }
    </article>
  `,
  styles: `
    :host {
      display: flex;
    }

    article ::ng-deep .analog-markdown {
      display: flex;
      flex-direction: column;
      gap: 8px;

      h1 {
        color: var(--gray, #5e5c5a);
        font:
          750 32px / 40px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 750;
      }

      h2 {
        color: var(--gray, #5e5c5a);
        font:
          500 normal 18px/140% Fredoka,
          sans-serif;
        margin-top: 32px;
      }

      p {
        margin: 8px 0;

        &.subtitle {
          color: var(--gray-dark, #3d3c3a);
          margin: 0;
          font:
            300 18px/24px Fredoka,
            sans-serif;
        }
      }

      p,
      li {
        color: var(--gray-dark, #3d3c3a);
        font:
          400 normal 15px/160% Fredoka,
          sans-serif;
      }

      ul,
      ol {
        display: flex;
        flex-direction: column;
        list-style: none;
        margin-left: 8px;

        > li {
          position: relative;
          padding-left: 40px;
          font:
            400 15px/24px Fredoka,
            sans-serif;
        }
      }

      ul {
        gap: 8px;

        > li {
          &::before {
            position: absolute;
            top: 9px;
            left: 8px;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--gray, #5e5c5a);
            content: '';
          }
        }
      }

      ol {
        gap: 16px;
        counter-reset: ordered-listitem;

        > li {
          &::after {
            position: absolute;
            top: -1px;
            left: 0;
            background: var(--sunshine-yellow-light, #fbe7b6);
            border: 1px solid var(--sunshine-yellow-dark, #e8a23d);
            border-radius: 8px;
            width: 24px;
            height: 24px;
            display: inline-block;
            text-align: center;
            content: counter(ordered-listitem);
            counter-increment: ordered-listitem;
          }
        }
      }
    }
  `,
})
export default class WorkshopPage {
  readonly post$ = injectContent({
    subdirectory: 'workshops',
    param: 'slug',
  });
  readonly post = toSignal(this.post$);
}
