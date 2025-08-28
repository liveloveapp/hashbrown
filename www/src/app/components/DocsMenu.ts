import { Component, inject } from '@angular/core';
import { ConfigService } from '../services/ConfigService';
import { computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Squircle } from './Squircle';
import { DropdownMenu } from './DropDownMenu';
import { Angular } from '../icons/Angular';
import { React } from '../icons/React';
import { ChevronDown } from '../icons/ChevronDown';

@Component({
  selector: 'www-docs-menu',
  imports: [
    Angular,
    ChevronDown,
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
        <div content>
          <a routerLink="/docs/angular/start/intro" class="menu-item">
            <www-angular height="16px" width="16px" fill="#774625" />
            Angular
          </a>
          <a routerLink="/docs/react/start/intro" class="menu-item">
            <www-react height="16px" width="16px" fill="#774625" />
            React
          </a>
        </div>
      </www-dropdown-menu>
    </div>
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
        <!-- <li>
          <a [routerLink]="[docsUrl(), 'guide', 'quick']"
            >Interacting with AI</a
          >
        </li> -->
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'system-instructions']"
            routerLinkActive="active"
            wwwSquircle="8"
            >1. System Instructions</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'schema']"
            routerLinkActive="active"
            wwwSquircle="8"
            >2. Skillet Schema</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'streaming']"
            routerLinkActive="active"
            wwwSquircle="8"
            >3. Streaming</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'functions']"
            routerLinkActive="active"
            wwwSquircle="8"
            >4. Tool Calling</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'structured-output']"
            routerLinkActive="active"
            wwwSquircle="8"
            >5. Structured Output</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'components']"
            routerLinkActive="active"
            wwwSquircle="8"
            >6. Generative UI</a
          >
        </li>
        <li>
          <a
            [routerLink]="[docsUrl(), 'concept', 'runtime']"
            routerLinkActive="active"
            wwwSquircle="8"
            >7. JavaScript Runtime</a
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
            [routerLink]="[docsUrl(), 'recipes', 'remote-mcp']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Remote MCP</a
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
            [routerLink]="[docsUrl(), 'platform', 'writer']"
            routerLinkActive="active"
            wwwSquircle="8"
            >Writer</a
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
      padding: 16px;
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
      width: 192px;
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
  `,
})
export class DocsMenu {
  configService = inject(ConfigService);
  sdk = this.configService.sdk;

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}`;
  });
}
