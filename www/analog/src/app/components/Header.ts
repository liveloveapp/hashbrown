import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Command } from '../icons/Command';
import { Menu } from '../icons/Menu';
import { ConfigService } from '../services/ConfigService';
import { ApiMenu } from './ApiMenu';
import { DocsMenu } from './DocsMenu';
import { DropdownMenu } from './DropDownMenu';
import { FullscreenMenu } from './FullscreenMenu';
import { GitHubStarButton } from './GitHubStarButton';
import { SEARCH_OVERLAY_OPEN_EVENT } from './SearchOverlay';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-header',
  imports: [
    ApiMenu,
    Command,
    DocsMenu,
    GitHubStarButton,
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
                    <!-- <a
                      routerLink="/samples/fast-food"
                      class="menu-item"
                      wwwSquircle="8"
                      >fast food app
                    </a> -->
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
              <!-- <li>
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
              </li> -->
              <li>
                <a routerLink="/blog" routerLinkActive="active">blog</a>
              </li>
              <li>
                <button (click)="search()">
                  <span
                    wwwSquircle="4"
                    [wwwSquircleBorderWidth]="2"
                    wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
                    ><www-command height="12px" width="12px"
                  /></span>
                  <span
                    wwwSquircle="4"
                    [wwwSquircleBorderWidth]="2"
                    wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
                    >k</span
                  >
                </button>
              </li>
              <li>
                <www-github-star-button />
              </li>
            </ul>
          </nav>
        </div>
        <div class="menu">
          <www-fullscreen-menu
            #fullScreenMenu
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
                <div class="footer">
                  <a
                    (click)="fullScreenMenu.onClick()"
                    routerLink="/samples"
                    wwwSquircle="8"
                  >
                    examples
                  </a>
                  <!-- <a
                    (click)="fullScreenMenu.onClick()"
                    routerLink="/workshops"
                    wwwSquircle="8"
                  >
                    workshops
                  </a> -->
                  <a
                    (click)="fullScreenMenu.onClick()"
                    routerLink="/blog"
                    wwwSquircle="8"
                  >
                    blog
                  </a>
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
                gap: 18px;

                > li {
                  display: flex;
                  justify-content: center;
                  align-items: center;

                  > a,
                  > www-dropdown-menu button label > a {
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

                  > button {
                    display: flex;
                    align-items: center;
                    gap: 4px;

                    > span {
                      display: inline-flex;
                      align-items: center;
                      justify-content: center;
                      color: var(--chocolate-brown-light, #ad907c);
                      height: 16px;
                      width: 16px;
                      text-transform: uppercase;
                      font:
                        500 12px/140% Fredoka,
                        sans-serif;
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
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;

            > button,
            > a {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 4px;
              padding: 12px 16px;
              color: rgba(0, 0, 0, 0.64);
              background: rgba(61, 60, 58, 0.036);
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

          > .docs-menu,
          > .api-menu {
            flex: 1 auto;
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

          > .footer {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;

            > button,
            > a {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 4px;
              padding: 12px 16px;
              color: rgba(0, 0, 0, 0.64);
              background: rgba(61, 60, 58, 0.036);
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

      @media screen and (min-width: 1024px) {
        header {
          > menu {
            > .right {
              > nav {
                > ul {
                  gap: 24px;
                }
              }
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

  search() {
    window.dispatchEvent(new Event(SEARCH_OVERLAY_OPEN_EVENT));
  }
}
