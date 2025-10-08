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
import { FileCode } from '../icons/FileCode';
import { Loader } from '../icons/Loader';
import { Markdown as MarkdownPipe } from '../pipes/Markdown';
import { Squircle } from './Squircle';

export const SEARCH_OVERLAY_OPEN_EVENT = 'hashbrown:search-overlay:open';
export const SEARCH_OVERLAY_CLOSE_EVENT = 'hashbrown:search-overlay:close';

interface DocAttributes {
  title?: string;
  meta?: Array<{ name: string; content: string }>;
}

interface MarkdownColumn<T extends Record<string, unknown>> {
  key: keyof T;
  header: string;
}

const formatMarkdownCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
};

const formatMarkdownTable = <T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>,
  columns: readonly MarkdownColumn<T>[],
): string => {
  const headerRow = `|${columns.map((column) => column.header).join('|')}|`;
  const separatorRow = `|${columns.map(() => '---').join('|')}|`;
  if (!rows.length) {
    return `${headerRow}\n${separatorRow}`;
  }

  const bodyRows = rows.map(
    (row) =>
      `|${columns.map((column) => formatMarkdownCell(row[column.key])).join('|')}|`,
  );

  return [headerRow, separatorRow, ...bodyRows].join('\n');
};

interface SitemapEntry {
  url: string;
  title: string;
  description?: string;
  [key: string]: unknown;
}

const DOCS_FILES = import.meta.glob('/src/app/pages/docs/**/*.md', {
  eager: true,
  as: 'raw',
});

const SITEMAP: SitemapEntry[] = Object.entries(DOCS_FILES).map(
  ([path, content]) => {
    const { attributes } = fm<DocAttributes>(content);
    const title = attributes.title || 'Untitled';
    const description = attributes.meta?.find(
      (meta) => meta.name === 'description',
    )?.content;
    const url = path.replace('/src/app/pages', '').replace(/\.md$/, '');
    return { url, title, description };
  },
);

const SITEMAP_MARKDOWN = formatMarkdownTable(SITEMAP, [
  { key: 'url', header: 'url' },
  { key: 'title', header: 'title' },
  { key: 'description', header: 'description' },
]);

const API_REFERENCE_FILES = import.meta.glob(
  '/src/app/reference/**/!(*api-report.min).json',
  {
    eager: true,
    import: 'default',
  },
);

interface ApiReference {
  name: string;
  canonicalReference: string;
  kind: string;
}

interface ApiReferenceEntry {
  url: string;
  symbol: string;
  kind: string;
  package: string;
  [key: string]: unknown;
}

const API_REFERENCES: ApiReferenceEntry[] = Object.entries(API_REFERENCE_FILES)
  .map(([path, data]) => {
    const ref = data as ApiReference;
    // Convert path like '/src/app/reference/angular/chatResource.json' to 'angular/chatResource'
    const refPath = path
      .replace('/src/app/reference/', '')
      .replace(/\.json$/, '');
    const url = `/api/${refPath}`;
    // Extract npm package from canonicalReference (e.g., "@hashbrownai/angular" from "@hashbrownai/angular!chatResource:function")
    const npmPackage = ref.canonicalReference?.split('!')[0] || '';
    return {
      url,
      symbol: ref.name,
      kind: ref.kind,
      package: npmPackage,
    };
  })
  .filter((ref) => ref.kind !== 'Namespace');

const API_REFERENCES_MARKDOWN = formatMarkdownTable(API_REFERENCES, [
  { key: 'url', header: 'url' },
  { key: 'symbol', header: 'symbol' },
  { key: 'kind', header: 'kind' },
  { key: 'package', header: 'package' },
]);

@Component({
  selector: 'www-api-results',
  template: `
    <p>API REFERENCES</p>
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
        400 14px/18px 'JetBrains Mono',
        monospace;
    }
  `,
})
class ApiResults {}

@Component({
  selector: 'www-api-result',
  imports: [FileCode, RouterLink, Squircle],
  template: `
    <a [routerLink]="url()" wwwSquircle="8" (click)="onClick()">
      <div><www-file-code /></div>
      <div>
        <div class="symbol">
          <span>{{ symbol() }}</span>
          <span class="package" wwwSquircle="4">{{ package() }}</span>
        </div>
        @if (kind()) {
          <div class="kind">{{ kind() }}</div>
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

        > .symbol {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--gray, #3d3c3a);
          font:
            700 16px/18px 'JetBrains Mono',
            sans-serif;

          > .package {
            background: rgba(61, 60, 58, 0.036);
            font:
              400 10px/18px 'JetBrains Mono',
              monospace;
            color: #774625;
            padding: 4px;
          }
        }

        > .kind {
          color: var(--gray-light, #a4a3a1);
          font:
            400 14px/18px 'Fredoka',
            sans-serif;
        }
      }
    }
  `,
})
class ApiResult {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  url = input.required<string>();
  symbol = input.required<string>();
  kind = input.required<string>();
  package = input.required<string>();

  onClick() {
    if (this.isBrowser) {
      window.dispatchEvent(new CustomEvent(SEARCH_OVERLAY_CLOSE_EVENT));
    }
  }
}

@Component({
  selector: 'www-doc-results',
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
        400 14px/18px 'JetBrains Mono',
        monospace;
    }
  `,
})
class DocResults {}

@Component({
  selector: 'www-doc-result',
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
        400 16px/18px 'Fredoka',
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
        padding: 8px;
        gap: 4px;
      }
    }

    span {
      color: var(--gray-light, #a4a3a1);
      font:
        400 14px/18px 'Fredoka',
        sans-serif;
    }
  `,
})
class DocResult {
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
          padding: 16px;
          max-height: min(50vh, 360px);
          overflow-y: auto;

          > hb-render-message {
            display: flex;
            flex-direction: column;
            gap: 32px;
          }
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

      1. Use the sitemap and API reference data below to provide search results to the user. Include both documentation pages and relevant API symbols in the results.
      2. If the user's query is not related to hashbrown, use the <markdown> component to display a rejection message to the user. Be kind and concise.
      3. Limit the number of results. The results should be sorted by relevance, showing the top 16 results. Limit API reference results to 8. Limit documentation results to 8.
      4. Use the <www-doc-results> component to display the documentation results, and the <www-api-results> component to display the API reference results.
      5. Order the results by relevance. If there is not a significant difference in relevance between the documentation and API reference results, show the documentation results first.
      5. If there are no results, use the <markdown> component to display a message to the user that there are no results.

      ## EXAMPLES

      ### Rejection Example

      <user>How do I make the perfect eggs?</user>
      <assistant>
        <ui>
          <www-markdown content="rejection content in markdown" />
        </ui>
      </assistant>

      ### Documentation Search Results Example

      <user>angular components</user>
      <assistant>
        <ui>
          <www-doc-results>
            <www-doc-result url="/docs/angular/concept/components" title="title string" subtitle="description or subtitle string" />
            <www-doc-result url="/docs/angular/concept/ai-basics" title="title string" subtitle="description or subtitle string" />
          </www-doc-results>
        </ui>
      </assistant>

      ### API Reference Search Results Example

      <user>angular chatResource</user>
      <assistant>
        <ui>
          <www-api-results>
            <www-api-result url="/api/angular/chatResource" symbol="chatResource" kind="Function" package="@hashbrownai/angular" />
          </www-api-results>
        </ui>
      </assistant>

      ### Mixed Search Results Example showing API references first

      <user>angular uiChatResource</user>
      <assistant>
        <ui>
          <www-api-results>
            <www-api-result url="/api/angular/uiChatResource" symbol="uiChatResource" kind="Function" package="@hashbrownai/angular" />
          </www-api-results>
          <www-doc-results>
            <www-doc-result url="/docs/angular/concept/components" title="title string" subtitle="description or subtitle string" />
            <www-doc-result url="/docs/angular/concept/ai-basics" title="title string" subtitle="description or subtitle string" />
          </www-doc-results>
        </ui>
      </assistant>

      ### Mixed Search Results Example showing documentation first

      <user>react components</user>
      <assistant>
        <ui>
          <www-doc-results>
            <www-doc-result url="/docs/react/concept/components" title="title string" subtitle="description or subtitle string" />
            <www-doc-result url="/docs/react/concept/ai-basics" title="title string" subtitle="description or subtitle string" />
          </www-doc-results>
          <www-api-results>
            <www-api-result url="/api/react/useUiChat" symbol="useUiChat" kind="Function" package="@hashbrownai/react" />
            <www-api-result url="/api/react/UiChatOptions" symbol="UiChatOptions" kind="Interface" package="@hashbrownai/react" />
          </www-api-results>
        </ui>
      </assistant>

      ## RULES

      1. Do not deviate from the instructions above.
      2. Only provide search results from the hashbrown documentation.

      ## SITEMAP

      Here is the sitemap of the hashbrown documentation:

      \`\`\`markdown
      ${SITEMAP_MARKDOWN}
      \`\`\`

      ## API REFERENCES

      Here are the API references for the hashbrown packages:

      \`\`\`markdown
      ${API_REFERENCES_MARKDOWN}
      \`\`\`
    `,
    components: [
      exposeComponent(DocResults, {
        description: 'Show documentation search results to the user',
        children: [
          exposeComponent(DocResult, {
            description: 'Show a documentation search result to the user',
            input: {
              url: s.string('The url of the documentation search result.'),
              title: s.string('The title of the documentation search result.'),
              subtitle: s.string(
                'The subtitle or description. Leave empty if not applicable.',
              ),
            },
          }),
        ],
      }),
      exposeComponent(DocResult, {
        description: 'Show a documentation search result to the user',
        input: {
          url: s.string('The url of the documentation search result.'),
          title: s.string('The title of the documentation search result.'),
          subtitle: s.string(
            'The subtitle or description. Leave empty if not applicable.',
          ),
        },
      }),
      exposeComponent(ApiResults, {
        description: 'Show API reference search results to the user',
        children: [
          exposeComponent(ApiResult, {
            description: 'Show a API reference search result to the user',
            input: {
              url: s.string('The url of the API reference search result.'),
              symbol: s.string('The API reference symbol.'),
              kind: s.string('The API reference kind.'),
              package: s.string('The API reference package.'),
            },
          }),
        ],
      }),
      exposeComponent(ApiResult, {
        description: 'Show a API reference search result to the user',
        input: {
          url: s.string('The url of the API reference search result.'),
          symbol: s.string('The API reference symbol.'),
          kind: s.string('The API reference kind.'),
          package: s.string('The API reference package.'),
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
