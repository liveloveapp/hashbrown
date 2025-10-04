/// <reference types="vite/client" />

import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
  FullscreenOverlayContainer,
  Overlay,
  OverlayContainer,
} from '@angular/cdk/overlay';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import fm from 'front-matter';
import { fromEvent } from 'rxjs';
import { Close } from '../icons/Close';
import { File } from '../icons/File';
import { Loader } from '../icons/Loader';
import { Markdown as MarkdownPipe } from '../pipes/Markdown';
import { Squircle } from './Squircle';

export const SEARCH_OVERLAY_OPEN_EVENT = 'hashbrown:search-overlay:open';
export const SEARCH_OVERLAY_CLOSE_EVENT = 'hashbrown:search-overlay:close';

interface DocAttributes {
  title?: string;
  meta?: Array<{ name: string; content: string }>;
}

const DOCS_FILES = import.meta.glob('/src/app/pages/docs/**/*.md', {
  eager: true,
  as: 'raw',
});

const DOCS = Object.entries(DOCS_FILES).map(([path, content]) => {
  const { attributes } = fm<DocAttributes>(content);
  const title = attributes.title || 'Untitled';
  const description = attributes.meta?.find(
    (meta) => meta.name === 'description',
  )?.content;
  const url = path.replace('/src/app/pages', '').replace(/\.md$/, '');
  return { url, title, description };
});

@Component({
  selector: 'www-search-results',
  template: `
    <p>DOCS</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    p {
      color: var(--gray-dark, #3d3c3a);
      font:
        800 14px/18px 'JetBrains Mono',
        monospace;
    }
  `,
})
class SearchResults {}

@Component({
  selector: 'www-search-result',
  imports: [File, RouterLink, Squircle],
  template: `
    <a [routerLink]="url()" wwwSquircle="8" (click)="onClick()">
      <div><www-file /></div>
      <div>
        {{ title() }}
        @if (subtitle()) {
          <span>{{ subtitle() }}</span>
        }
      </div>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    a {
      display: grid;
      grid-template-columns: auto 1fr;
      text-decoration: none;
      color: var(--gray, #3d3c3a);
      font:
        400 16px/24px 'Fredoka',
        sans-serif;

      &:hover,
      &.active {
        background: var(--sunshine-yellow-light, #fde4ba);
      }

      > div:first-child {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
      }

      > div:last-child {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
      }
    }

    span {
      color: var(--gray-light, #a4a3a1);
      font:
        400 14px/24px 'Fredoka',
        sans-serif;
    }
  `,
})
class SearchResult {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  url = input.required<string>();
  title = input.required<string>();
  subtitle = input<string>('');

  onClick() {
    if (this.isBrowser) {
      window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_CLOSE_EVENT));
    }
  }
}

@Component({
  selector: 'www-markdown',
  imports: [MarkdownPipe],
  template: `<div [innerHTML]="content() | markdown"></div>`,
})
class Markdown {
  content = input.required<string>();
}

@Component({
  selector: 'www-search-overlay',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    Close,
    Loader,
    RenderMessageComponent,
    Squircle,
  ],
  providers: [
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
  ],
  template: `
    <div
      #origin="cdkOverlayOrigin"
      cdkOverlayOrigin
      class="overlay-anchor"
    ></div>
    <ng-template
      [cdkConnectedOverlayBackdropClass]="'www-search-overlay-backdrop'"
      [cdkConnectedOverlayHasBackdrop]="true"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayPanelClass]="'www-search-overlay-panel'"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      (backdropClick)="closeOverlay()"
      cdkConnectedOverlay
    >
      <div
        class="search-content"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        (click)="onOverlayClick($event)"
        wwwSquircle="16"
      >
        <div>
          <form (submit)="onSubmit($event)">
            <label class="visually-hidden" [attr.for]="inputId">
              Search query
            </label>
            <div [class.loading]="chat.isLoading()">
              <input
                #queryInput
                type="text"
                [attr.id]="inputId"
                name="query"
                autocomplete="off"
                enterkeyhint="search"
                attr-placeholder="Search the site"
                [value]="query()"
                (input)="onInput($event)"
              />
              @if (query() || chat.isLoading()) {
                <button
                  type="button"
                  (click)="onIconClick()"
                  (mouseenter)="iconHovered.set(true)"
                  (mouseleave)="iconHovered.set(false)"
                  aria-label="{{
                    chat.isLoading() ? 'Cancel search' : 'Clear search'
                  }}"
                  wwwSquircle="4"
                >
                  @if (chat.isLoading() && !iconHovered()) {
                    <www-loader height="20px" width="20px" />
                  } @else {
                    <www-close height="20px" width="20px" />
                  }
                </button>
              }
            </div>
            <button type="submit" wwwSquircle="8">Search</button>
          </form>

          @let message = chat.lastAssistantMessage();
          @if (message) {
            <section>
              <hb-render-message [message]="message" />
            </section>
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }

    .overlay-anchor {
      display: none;
    }

    ::ng-deep .www-search-overlay-panel {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      transform: none !important;
      pointer-events: none;
      display: flex;
    }

    ::ng-deep .www-search-overlay-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(61, 60, 58, 0.32);
    }

    .search-content {
      pointer-events: auto;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      height: 100%;
      padding: 16px;

      > button {
        position: absolute;
        top: 24px;
        right: 24px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      > div {
        width: min(760px, 100%);
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        background: var(--vanilla-ivory, #faf9f0);
        box-shadow: 0 8px 16px rgba(61, 60, 58, 0.4);

        > form {
          display: flex;
          flex-direction: row;
          gap: 12px;
          align-items: center;
          padding: 16px;

          > label {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }

          > div {
            position: relative;
            flex: 1 1 auto;
            display: flex;
            align-items: center;

            &.loading {
              > input {
                background: linear-gradient(
                  to right,
                  rgba(251, 187, 82, 0.15) 0%,
                  rgba(232, 140, 77, 0.15) 25%,
                  rgba(237, 131, 144, 0.15) 50%,
                  rgba(108, 175, 228, 0.15) 75%,
                  rgba(175, 191, 119, 0.15) 100%
                );
                background-clip: border-box;
                background-size: 400% 400%;
                animation: inputShimmer 3s ease infinite;
                border-color: var(--sunshine-orange-dark, #e88c4d);
              }

              > button {
                animation: spin 1s linear infinite;

                &:hover {
                  animation: none;
                }
              }
            }

            > input {
              width: 100%;
              padding: 8px 40px 8px 12px;
              border-radius: 8px;
              border: 1px solid var(--gray-light, #a4a3a1);
              background: #fff;
              color: var(--gray, #3d3c3a);
              font:
                400 18px/24px 'Fredoka',
                sans-serif;
              transition: all 200ms;

              &:focus {
                outline: none;
                border-color: var(--sunset-orange, #e88c4d);
                box-shadow: 0 0 0 4px rgba(232, 140, 77, 0.2);
              }
            }

            > button {
              position: absolute;
              right: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 28px;
              height: 28px;
              color: var(--gray, #3d3c3a);
              cursor: pointer;
              transition: all 200ms;

              &:hover {
                background: var(--gray-lighter, #e8e7e5);
                color: var(--sunset-orange, #e88c4d);
              }
            }
          }

          > button {
            padding: 9px 16px;
            cursor: pointer;
            background: var(--sunshine-yellow-light, #fbd38e);
            color: var(--gray, #5e5c5a);
            font:
              400 16px/24px 'Fredoka',
              sans-serif;
          }
        }

        > section {
          flex: 1 1 auto;
          padding: 0 16px 16px 16px;
          max-height: min(50vh, 360px);
          overflow-y: auto;
        }
      }
    }

    @media screen and (min-width: 768px) {
      .search-content {
        padding: 24px;
      }
    }

    @keyframes inputShimmer {
      0% {
        background-position: 20% 50%;
      }
      50% {
        background-position: 80% 50%;
      }
      100% {
        background-position: 20% 50%;
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class SearchOverlay implements OnDestroy {
  private readonly overlay = inject(Overlay);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT, { optional: true });
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  positions = input<ConnectedPosition[]>([
    {
      originX: 'center',
      originY: 'top',
      overlayX: 'center',
      overlayY: 'bottom',
    },
  ]);

  open = signal(false);
  query = signal('');
  iconHovered = signal(false);

  chat = uiChatResource({
    model: 'gpt-5-nano',
    debugName: 'search-overlay',
    system: prompt`
      ## ROLE & TONE

      This is a search overlay for the hashbrown website.
      You are the search assistant whose goal is to provide search results for the user.
      You can also provide a brief and terse response to the user that is helpful using markdown.

      ## INSTRUCTIONS

      1. Use the documentation source to provide search results.
      2. If the user's query is not related to hashbrown, use the <markdown> component to display a rejection message to the user. Be kind and concise.
      3. Limit the number of results. The results should be sorted by relevance, showing the top 10 results.
      4. Use the <search-results> component to display the search results.
      5. For each result, use the <search-result> component to display a single search result to the user. 
      6. If there are no results, use the <markdown> component to display a message to the user that there are no results.

      ## EXAMPLES

      Here is an example of a search rejection:

      <user>How do I make the perfect eggs?</user>
      <assistant>
        <ui>
          <www-markdown content="rejection content in markdown" />
        </ui>
      </assistant>

      Here is an example displaying multiple search results:

      <user>angular components</user>
      <assistant>
        <ui>
          <www-search-results>
            <www-search-result url="/docs/angular/concept/components" title="title string" subtitle="description or subtitle string" />
            <www-search-result url="/docs/angular/concept/ai-basics" title="title string" subtitle="description or subtitle string" /></www-search-result>
          </www-search-results>
        </ui>
      </assistant>

      ## RULES

      1. Do not deviate from the instructions above.
      2. Only provide search results from the hashbrown documentation.

      ## DOCUMENTATION SOURCE

      \`\`\`json
      ${JSON.stringify(DOCS, null, 2)}
      \`\`\`
    `,
    components: [
      exposeComponent(SearchResults, {
        description: 'Show multiple search results to the user',
        children: [
          exposeComponent(SearchResult, {
            description: 'Show a search result to the user',
            input: {
              url: s.string('The url of the search result.'),
              title: s.string('The title of the search result.'),
              subtitle: s.string(
                'The subtitle or description. Leave empty if not applicable.',
              ),
            },
          }),
        ],
      }),
      exposeComponent(SearchResult, {
        description: 'Show a search result to the user',
        input: {
          url: s.string('The url of the search result.'),
          title: s.string('The title of the search result.'),
          subtitle: s.string(
            'The subtitle or description. Leave empty if not applicable.',
          ),
        },
      }),
      exposeComponent(Markdown, {
        description: 'Show a message to the user using simple markdown',
        input: {
          content: s.streaming.string('The markdown content'),
        },
      }),
    ],
  });

  readonly overlayId = 'www-search-' + Math.random().toString(36).slice(2);
  readonly titleId = `${this.overlayId}-title`;
  readonly inputId = `${this.overlayId}-input`;
  readonly scrollStrategy = this.overlay.scrollStrategies.block();

  private queryInputRef = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  constructor() {
    if (this.isBrowser) {
      fromEvent(window, SEARCH_OVERLAY_OPEN_EVENT)
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.openOverlay());

      fromEvent(window, SEARCH_OVERLAY_CLOSE_EVENT)
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.closeOverlay());
    }

    effect(() => {
      const ref = this.queryInputRef();
      if (ref) {
        ref.nativeElement.focus();
        ref.nativeElement.select();
      }
    });
  }

  ngOnDestroy() {
    if (this.isBrowser && this.document?.body) {
      this.document.body.classList.remove('www-search-overlay-open');
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.closeOverlay();
    }
  }

  openOverlay() {
    if (this.open()) {
      return;
    }

    this.open.set(true);
  }

  closeOverlay() {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeOverlay();
    }
  }

  onInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    this.query.set(input?.value ?? '');
  }

  onSubmit(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.chat.sendMessage({
      role: 'user',
      content: {
        query: this.query(),
      },
    });
  }

  onIconClick() {
    if (this.chat.isLoading()) {
      this.chat.stop();
    }
    this.query.set('');
    this.iconHovered.set(false);
    const input = this.queryInputRef()?.nativeElement;
    if (input) {
      input.focus();
    }
  }
}
