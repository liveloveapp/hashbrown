import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { Menu } from '../icons/Menu';
import { ConfigService } from '../services/ConfigService';
import { DropdownMenu } from './DropDownMenu';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-header',
  imports: [
    ArrowUpRight,
    Menu,
    RouterLink,
    RouterLinkActive,
    DropdownMenu,
    Squircle,
  ],
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
                  <label>examples</label>
                  <div content class="dropdown-content">
                    <a
                      href="https://finance.hashbrown.dev"
                      target="_blank"
                      class="menu-item"
                      wwwSquircle="8"
                      >finance app <www-arrow-up-right />
                    </a>
                  </div>
                </www-dropdown-menu>
              </li>
              <li>
                <a [routerLink]="workshopsUrl()" routerLinkActive="active">
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
            </ul>
          </nav>
        </div>
        <div class="menu">
          <www-dropdown-menu
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
            <div content class="dropdown-content">
              <a routerLink="/" class="menu-item" wwwSquircle="8">home</a>
              <a [routerLink]="docsUrl()" class="menu-item" wwwSquircle="8"
                >docs</a
              >
              <a routerLink="/workshops" class="menu-item" wwwSquircle="8">
                workshops
              </a>
              <a routerLink="/blog" class="menu-item" wwwSquircle="8">blog</a>
              <a
                href="https://github.com/liveloveapp/hashbrown"
                target="_blank"
                class="menu-item"
                wwwSquircle="8"
                >github</a
              >
            </div>
          </www-dropdown-menu>
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
        padding: 24px;

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

      @media print {
        header {
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
  configService = inject(ConfigService);
  sdk = this.configService.sdk;

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/intro`;
  });

  workshopsUrl = computed(() => {
    switch (this.configService.sdk()) {
      case 'react':
        return '/workshops/react-generative-ui-engineering';
      case 'angular':
        return '/workshops/angular-generative-ui-engineering';
      default:
        return '/workshops';
    }
  });
}
