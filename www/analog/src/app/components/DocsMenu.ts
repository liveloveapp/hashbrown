import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { map, startWith } from 'rxjs/operators';
import { Angular } from '../icons/Angular';
import { ChevronDown } from '../icons/ChevronDown';
import { Command } from '../icons/Command';
import { React } from '../icons/React';
import { ConfigService } from '../services/ConfigService';
import { DropdownMenu } from './DropDownMenu';
import { SEARCH_OVERLAY_OPEN_EVENT } from './SearchOverlay';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-docs-menu',
  imports: [
    Angular,
    ChevronDown,
    Command,
    DropdownMenu,
    React,
    RouterLink,
    RouterLinkActive,
    Squircle,
  ],
  template: `
    <div class="sdk">
      <www-dropdown-menu
        [positions]="[
          {
            originX: 'start',
            originY: 'bottom',
            overlayX: 'start',
            overlayY: 'top',
            offsetY: 8,
          },
        ]"
        wwwSquircle="8"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sky-blue, #9ecfd7)"
      >
        @switch (sdk()) {
          @case ('angular') {
            <label>
              <span
                ><www-angular
                  height="16px"
                  width="16px"
                  fill="#774625"
                />Angular</span
              >
              <www-chevron-down height="16px" width="16px" />
            </label>
          }
          @case ('react') {
            <label>
              <span
                ><www-react
                  height="16px"
                  width="16px"
                  fill="#774625"
                />React</span
              >
              <www-chevron-down height="16px" width="16px" />
            </label>
          }
        }
        <div content class="dropdown-content">
          <a [routerLink]="angularDocsUrl()" class="menu-item">
            <www-angular height="16px" width="16px" fill="#774625" />
            Angular
          </a>
          <a [routerLink]="reactDocsUrl()" class="menu-item">
            <www-react height="16px" width="16px" fill="#774625" />
            React
          </a>
        </div>
      </www-dropdown-menu>
    </div>
    <button
      (click)="search()"
      class="search"
      wwwSquircle="8"
      [wwwSquircleBorderWidth]="2"
      wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
    >
      <p>Search</p>
      <div>
        <span
          wwwSquircle="4"
          [wwwSquircleBorderWidth]="2"
          wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
          ><www-command height="16px" width="16px"
        /></span>
        <span
          wwwSquircle="4"
          [wwwSquircleBorderWidth]="2"
          wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
          >k</span
        >
      </div>
    </button>
    <div>
      <h2>Getting Started</h2>
      <ul>
        <li>
          <a
            [routerLink]="[docsUrl(), 'start', 'intro']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Introduction</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'start', 'quick']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Quickstart</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'start', 'sample']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Samples</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'start', 'overview']"
            routerLinkActive="active"
            wwwSquircle="8"
            >API Overview</a
          >
        </li>
      </ul>
    </div>
    <div>
      <h2>Guide</h2>
      <ol>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'ai-basics']"
            routerLinkActive="active"
            wwwSquircle="8"
            >1. Basics of AI</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'system-instructions']"
            routerLinkActive="active"
            wwwSquircle="8"
            >2. System Instructions</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'schema']"
            routerLinkActive="active"
            wwwSquircle="8"
            >3. Skillet Schema</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'streaming']"
            routerLinkActive="active"
            wwwSquircle="8"
            >4. Streaming</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'functions']"
            routerLinkActive="active"
            wwwSquircle="8"
            >5. Tool Calling</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'structured-output']"
            routerLinkActive="active"
            wwwSquircle="8"
            >6. Structured Output</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'components']"
            routerLinkActive="active"
            wwwSquircle="8"
            >7. Generative UI</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'runtime']"
            routerLinkActive="active"
            wwwSquircle="8"
            >8. JavaScript Runtime</a
          >
        </li>
      </ol>
    </div>
    <div>
      <h2>Recipes</h2>
      <ol>
        <li>
          <a
            [routerLink]="[
              docsUrl(),
              'recipes',
              'natural-language-to-structured-data',
            ]"
            routerLinkActive="active"
            wwwSquircle="8"
            >Natural Language Forms</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'recipes', 'ui-chatbot']"
            routerLinkActive="active"
            wwwSquircle="8"
            >UI Chatbot with Tools</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'recipes', 'predictive-actions']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Predictive Suggestions</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'recipes', 'remote-mcp']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Remote MCP</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'recipes', 'local-models']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Local Models</a
          >
        </li>
      </ol>
    </div>
    <div>
      <h2>Platforms</h2>
      <ul>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'openai']"
            routerLinkActive="active"
            wwwSquircle="8"
            >OpenAI</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'anthropic']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Anthropic</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'google']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Google</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'azure']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Azure</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'bedrock']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Amazon Bedrock</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'writer']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Writer</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'platform', 'ollama']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Ollama</a
          >
        </li>
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
      width: 100%;
      overflow-y: auto;
      overflow-x: hidden;

      > div {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > h2 {
          padding: 6px 12px;
          color: var(--gray, #5e5c5a);
          font:
            400 16px/18px Fredoka,
            sans-serif;
        }

        > ul,
        ol {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 4px;

          > li {
            display: flex;
            align-items: center;
            padding: 0;

            > a {
              display: flex;
              color: var(--chocolate-brown, #774625);
              padding: 6px 12px;
              width: 100%;
              font:
                400 13px/18px Fredoka,
                sans-serif;

              &:hover,
              &.active {
                background: var(--sunshine-yellow-light, #fde4ba);
              }
            }
          }
        }
      }

      > .search {
        display: flex;
        flex-direction: row;
        padding: 8px 8px 8px 12px;
        justify-content: space-between;
        align-items: center;
        align-self: stretch;

        > p {
          color: var(--chocolate-brown-light, #ad907c);
          font:
            500 12px/140% Fredoka,
            sans-serif;
        }

        > div {
          display: flex;
          align-items: center;
          gap: 4px;

          > span {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--chocolate-brown-light, #ad907c);
            height: 24px;
            width: 24px;
            text-transform: uppercase;
            font:
              500 12px/140% Fredoka,
              sans-serif;
          }
        }
      }
    }

    .dropdown-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 8px 16px 2px rgba(0, 0, 0, 0.12);
      background: #fff;
    }

    .sdk ::ng-deep button {
      display: flex;
      height: 40px;
      width: 100%;
      padding: 8px 12px;
      background: rgba(158, 207, 215, 0.24);

      > label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        color: rgba(0, 0, 0, 0.54);
        font:
          500 12px/16px Fredoka,
          sans-serif;

        > span {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      width: 100%;
      border-radius: 8px;
      color: var(--chocolate-brown, #774625);
      font:
        400 13px/18px Fredoka,
        sans-serif;

      &:hover,
      &.active {
        background: var(--sunshine-yellow-light, #fde4ba);
      }
    }

    @media screen and (min-width: 768px) {
      .menu-item {
        width: 128px;
      }
    }

    @media screen and (min-width: 1024px) {
      .menu-item {
        width: 192px;
      }
    }
  `,
})
export class DocsMenu {
  configService = inject(ConfigService);
  router = inject(Router);

  sdk = this.configService.sdk;

  url = toSignal(
    this.router.events.pipe(
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}`;
  });

  angularDocsUrl = computed(() => {
    const currentPath = this.url();
    const pathParts = currentPath.split('/').filter(Boolean);

    if (pathParts.length >= 3 && pathParts[0] === 'docs') {
      const folder = pathParts[2] ?? '';
      const file = pathParts[3] ?? '';
      if (folder && file) {
        return `/docs/angular/${folder}/${file}`;
      } else if (folder) {
        return `/docs/angular/${folder}`;
      }
    }

    return '/docs/angular/start/intro';
  });

  reactDocsUrl = computed(() => {
    const currentPath = this.url();
    const pathParts = currentPath.split('/').filter(Boolean);

    if (pathParts.length >= 3 && pathParts[0] === 'docs') {
      const folder = pathParts[2] ?? '';
      const file = pathParts[3] ?? '';
      if (folder && file) {
        return `/docs/react/${folder}/${file}`;
      } else if (folder) {
        return `/docs/react/${folder}`;
      }
    }

    return '/docs/react/start/intro';
  });

  search() {
    window.dispatchEvent(new Event(SEARCH_OVERLAY_OPEN_EVENT));
  }
}
