import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ConfigService } from '../services/ConfigService';
import { Menu } from '../icons/Menu';
import { DropdownMenu } from './DropDownMenu';
import { Angular } from '../icons/Angular';
import { React } from '../icons/React';

type HeaderPosition = 'fixed' | 'relative';

@Component({
  selector: 'www-header',
  imports: [Menu, RouterLink, RouterLinkActive, DropdownMenu, Angular, React],
  template: `
    <header [class]="position()">
      <menu [class.glass]="position() === 'fixed'">
        <div class="left">
          <a routerLink="/">
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
          </a>
        </div>
        <div class="right">
          <nav>
            <ul>
              <li>
                <a
                  routerLink="/"
                  routerLinkActive="active"
                  [routerLinkActiveOptions]="{ exact: true }"
                  >home</a
                >
              </li>
              <li>
                <a [routerLink]="docsUrl()" routerLinkActive="active">docs</a>
              </li>
              <li>
                <a routerLink="/products/workshops" routerLinkActive="active">
                  workshops
                </a>
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
              <li>
                <www-dropdown-menu
                  [positions]="[
                    {
                      originX: 'end',
                      originY: 'bottom',
                      overlayX: 'end',
                      overlayY: 'top',
                    },
                  ]"
                >
                  @switch (sdk()) {
                    @case ('angular') {
                      <label>
                        <www-angular
                          height="16px"
                          width="16px"
                          fill="#774625"
                        />
                      </label>
                    }
                    @case ('react') {
                      <label>
                        <www-react height="16px" width="16px" fill="#774625" />
                      </label>
                    }
                  }
                  <div content>
                    <a routerLink="/docs/angular/start/quick" class="menu-item">
                      <www-angular fill="#774625" />
                      Angular
                    </a>
                    <a routerLink="/docs/react/start/quick" class="menu-item">
                      <www-react fill="#774625" />
                      React
                    </a>
                  </div>
                </www-dropdown-menu>
              </li>
            </ul>
          </nav>
        </div>
        <div class="menu">
          <www-dropdown-menu
            [positions]="[
              {
                originX: 'start',
                originY: 'bottom',
                overlayX: 'start',
                overlayY: 'top',
              },
            ]"
          >
            <label><www-menu /></label>
            <div content>
              <a routerLink="/" class="menu-item">home</a>
              <a [routerLink]="docsUrl()" class="menu-item">docs</a>
              <a routerLink="/products/workshops" class="menu-item">
                workshops
              </a>
              <a routerLink="/blog" class="menu-item">blog</a>
              <a
                href="https://github.com/liveloveapp/hashbrown"
                target="_blank"
                class="menu-item"
                >github</a
              >
            </div>
          </www-dropdown-menu>
        </div>
      </menu>
    </header>
    @if (position() === 'fixed') {
      <div class="spacer"></div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: stretch;
        height: 80px;
      }

      header {
        display: flex;
        justify-content: center;
        width: 100%;
        padding: 12px 32px;

        &.fixed {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          align-items: center;
          height: 80px;

          > menu {
            box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
            transition: background-color 0.2s ease;

            &:hover {
              background: rgba(250, 249, 240, 0.56);
            }
          }
        }

        > menu {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          max-width: 1080px;
          padding: 12px 32px;

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

                  > a {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: var(--gray, #5e5c5a);
                    font:
                      500 16px/140% Fredoka,
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

            ::ng-deep button {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 4px;
              color: var(--gray, #5e5c5a);
              border-radius: 4px;
              transition: background-color 0.2s ease;

              &:hover {
                background-color: rgba(0, 0, 0, 0.04);
              }
            }
          }
        }
      }

      .spacer {
        height: 80px;
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: #774625;
        text-decoration: none;
        font:
          600 16px/24px Poppins,
          sans-serif;
        transition: background-color 0.2s ease;

        &:hover {
          background-color: rgba(119, 70, 37, 0.04);
          text-decoration: underline;
          text-decoration-color: #774625;
        }
      }

      @media print {
        header {
          display: none;
        }

        .spacer {
          display: none;
        }
      }

      @media screen and (min-width: 768px) {
        header {
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
  position = input<HeaderPosition>('relative');

  configService = inject(ConfigService);
  sdk = this.configService.sdk;

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
}
