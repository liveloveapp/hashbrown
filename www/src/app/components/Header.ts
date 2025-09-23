import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Menu } from '../icons/Menu';
import { ConfigService } from '../services/ConfigService';
import { DocsMenu } from './DocsMenu';
import { DropdownMenu } from './DropDownMenu';
import { FullscreenMenu } from './FullscreenMenu';
import { Squircle } from './Squircle';
import { ApiMenu } from './ApiMenu';

@Component({
  selector: 'www-header',
  imports: [
    ApiMenu,
    DocsMenu,
    DropdownMenu,
    FullscreenMenu,
    Menu,
    RouterLink,
    RouterLinkActive,
    Squircle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <menu>
        <div class="left">
          <a routerLink="/">
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
          </a>
        </div>
        <div class="right">
          <nav>
            <ul>
              <li>
                <a [routerLink]="docsUrl()" routerLinkActive="active">docs</a>
              </li>
              <li>
                <a routerLink="/api" routerLinkActive="active">api</a>
              </li>
              <li>
                <www-dropdown-menu
                  [positions]="[
                    {
                      originX: 'end',
                      originY: 'bottom',
                      overlayX: 'end',
                      overlayY: 'top',
                      offsetX: 16,
                      offsetY: 8,
                    },
                  ]"
                  openMode="hover"
                >
                  <label>
                    <a routerLink="/samples" routerLinkActive="active">
                      examples
                    </a>
                  </label>
                  <div content class="dropdown-content">
                    <a
                      routerLink="/samples/finance"
                      class="menu-item"
                      wwwSquircle="8"
                      >finance app
                    </a>
                    <a
                      routerLink="/samples/smart-home"
                      class="menu-item"
                      wwwSquircle="8"
                    >
                      smart home app
                    </a>
                  </div>
                </www-dropdown-menu>
              </li>
              <li>
                <www-dropdown-menu
                  [positions]="[
                    {
                      originX: 'end',
                      originY: 'bottom',
                      overlayX: 'end',
                      overlayY: 'top',
                      offsetX: 16,
                      offsetY: 8,
                    },
                  ]"
                  openMode="hover"
                >
                  <label>
                    <a routerLink="/workshops" routerLinkActive="active">
                      workshops
                    </a>
                  </label>
                  <div content class="dropdown-content">
                    <a
                      routerLink="/workshops/react-generative-ui-engineering"
                      class="menu-item"
                      wwwSquircle="8"
                      >react workshop</a
                    >
                    <a
                      routerLink="/workshops/angular-generative-ui-engineering"
                      class="menu-item"
                      wwwSquircle="8"
                      >angular workshop</a
                    >
                  </div>
                </www-dropdown-menu>
              </li>
              <li>
                <a routerLink="/blog" routerLinkActive="active">blog</a>
              </li>
              <li>
                <a
                  href="https://github.com/liveloveapp/hashbrown"
                  target="_blank"
                  class="github"
                >
                  github
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div class="menu">
          <www-fullscreen-menu
            [positions]="[
              {
                originX: 'start',
                originY: 'bottom',
                overlayX: 'end',
                overlayY: 'top',
                offsetX: 24,
                offsetY: 0,
              },
            ]"
          >
            <label><www-menu /></label>
            <div content class="fullscreen">
              <div class="header">
                <a routerLink="/">
                  <img
                    src="/image/logo/word-mark.svg"
                    alt="hashbrown"
                    height="24"
                  />
                </a>
              </div>
              <div class="content">
                <div class="actions">
                  <button
                    wwwSquircle="8"
                    [class.active]="menu() === 'docs'"
                    (click)="menu.set('docs')"
                  >
                    docs
                  </button>
                  <button
                    wwwSquircle="8"
                    [class.active]="menu() === 'api'"
                    (click)="menu.set('api')"
                  >
                    api
                  </button>
                </div>
                <div class="docs-menu" [class.active]="menu() === 'docs'">
                  <www-docs-menu />
                </div>
                <div class="api-menu" [class.active]="menu() === 'api'">
                  <www-api-menu />
                </div>
              </div>
            </div>
          </www-fullscreen-menu>
        </div>
      </menu>
    </header>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: stretch;
      }

      header {
        display: flex;
        justify-content: center;
        width: 100%;
        padding: 16px;

        > menu {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;

          > .left {
            display: flex;
            align-items: center;

            > a {
              display: flex;
              align-items: center;
              gap: 8px;
            }
          }

          > .right {
            display: none;

            > nav {
              > ul {
                display: flex;
                align-items: center;
                gap: 24px;

                > li {
                  display: flex;
                  justify-content: center;
                  align-items: center;

                  > a,
                  > www-dropdown-menu button > label {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: var(--gray, #5e5c5a);
                    font:
                      500 18px/140% Fredoka,
                      sans-serif;

                    &:hover,
                    &.active {
                      color: var(--sunset-orange, #e88c4d);
                    }
                  }
                }
              }
            }
          }

          > .menu {
            display: flex;
            margin-top: -4px;
            margin-bottom: -4px;
          }
        }
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: #774625;
        text-decoration: none;
        font:
          600 16px/24px Fredoka,
          sans-serif;
        transition: background-color 0.2s ease;

        &:hover {
          background-color: var(--sunshine-yellow-light, #fbd38e);
          text-decoration: underline;
          text-decoration-color: #774625;
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

      .fullscreen {
        display: flex;
        flex-direction: column;
        background: #fff;
        height: 100%;

        > .header {
          display: flex;
          align-items: center;
          padding: 16px;

          > a {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        > .content {
          flex: 1 auto;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 16px;
          padding: 16px;
          background: var(--vanilla-ivory, #faf9f0);
          overflow: hidden;

          > .actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;

            > button {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 4px;
              padding: 12px 16px;
              color: rgba(0, 0, 0, 0.64);
              background: transparent;
              font:
                500 18px/140% Fredoka,
                sans-serif;

              &.active {
                background: var(--sunshine-yellow-light, #fbd38e);
              }

              &:hover {
                color: var(--gray-dark, #3d3c3a);
              }
            }
          }

          > .docs-menu {
            display: none;
            overflow-y: auto;

            &.active {
              display: flex;
            }
          }

          > .api-menu {
            display: none;
            overflow-y: auto;

            &.active {
              display: flex;
            }

            > www-api-menu {
              width: 100%;
            }
          }
        }
      }

      @media print {
        header {
          display: none;
        }
      }

      @media screen and (min-width: 768px) {
        header {
          padding: 24px;

          > menu {
            > .right {
              display: flex;
            }

            > .menu {
              display: none;
            }
          }
        }
      }
    `,
  ],
})
export class Header {
  configService = inject(ConfigService);
  sdk = this.configService.sdk;

  menu = signal<'docs' | 'api'>('docs');

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/intro`;
  });
}
