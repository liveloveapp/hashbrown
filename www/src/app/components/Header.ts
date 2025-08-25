import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ConfigService } from '../services/ConfigService';
import { Menu } from '../icons/Menu';
import { DropdownMenu } from './DropDownMenu';

@Component({
  selector: 'www-header',
  imports: [Menu, RouterLink, RouterLinkActive, DropdownMenu],
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
                <a routerLink="/workshops" routerLinkActive="active">
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
            <div content>
              <a routerLink="/" class="menu-item">home</a>
              <a [routerLink]="docsUrl()" class="menu-item">docs</a>
              <a routerLink="/workshops" class="menu-item"> workshops </a>
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
}
