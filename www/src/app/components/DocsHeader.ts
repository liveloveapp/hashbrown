import { Component, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Angular } from '../icons/Angular';
import { KeyboardIcon } from '../icons/KeyboardIcon';
import { React } from '../icons/React';
import { ConfigService } from '../services/ConfigService';
import { DropdownMenu } from './DropDownMenu';

@Component({
  selector: 'www-docs-header',
  imports: [RouterLink, DropdownMenu, Angular, React, KeyboardIcon],
  template: `
    <header>
      <div class="left">
        <a routerLink="/">hashbrown</a>
        <nav>
          <ul>
            <li>
              <a [routerLink]="docsUrl()" class="underline">Docs</a>
            </li>
            <li><a routerLink="/api" class="underline">API</a></li>
            <li>
              <a routerLink="/enterprise" class="underline">Enterprise</a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="right">
        <div class="search">
          <input placeholder="Search" />
          <label>
            <www-keyboard-icon />
          </label>
        </div>
        <www-dropdown-menu [placement]="['right', 'bottom']">
          @switch (config().sdk) {
            @case ('angular') {
              <label>
                <www-angular height="16px" width="16px" />
                Angular
              </label>
            }
            @case ('react') {
              <label>
                <www-react height="16px" width="16px" />
                React
              </label>
            }
          }
          <div content>
            <a routerLink="/docs/angular/start/quick" (click)="close()">
              <www-angular />
              Angular
            </a>
            <a routerLink="/docs/react/start/quick" (click)="close()">
              <www-react />
              React
            </a>
          </div>
        </www-dropdown-menu>
      </div>
    </header>
  `,
  styles: [
    `
      header {
        display: flex;
        justify-content: space-between;
        padding: 32px;

        > .left {
          display: flex;
          gap: 24px;
          align-items: center;

          > a {
            font: 600 16px/24px sans-serif;
            color: rgba(47, 47, 43, 0.88);
            text-decoration: none;
            transition: color ease-in-out 0.15s;

            &:hover {
              color: rgba(47, 47, 43, 0.88);
              text-decoration: underline;
            }
          }

          nav {
            > ul {
              display: flex;
              align-items: center;
              gap: 24px;

              > li {
                display: flex;
                justify-content: center;
                align-items: center;
              }
            }
          }
        }

        > .right {
          display: flex;
          gap: 32px;
          align-items: center;

          .search {
            position: relative;

            > label {
              position: absolute;
              top: 11px;
              right: 8px;
            }

            > input {
              background-color: transparent;
              font-size: 16px;
              padding: 12px 48px 12px 12px;
              width: 100%;
              border: 1px solid rgba(47, 47, 43, 0.24);
              border-radius: 24px;
              transition:
                border-color ease-in-out 0.15s,
                box-shadow ease-in-out 0.15s;

              &:focus,
              &:active,
              &:focus-visible,
              &:hover {
                border-color: rgba(47, 47, 43, 0.88);
                outline: none;

                &::placeholder {
                  opacity: 1;
                }
              }

              &::placeholder {
                color: rgba(47, 47, 43, 0.24);
                opacity: 0.4;
                transition: opacity 0.2s ease-in-out;
              }
            }
          }

          www-dropdown-menu {
            label {
              display: flex;
              align-items: center;
              gap: 8px;
              text-decoration-line: underline;
              text-decoration-color: transparent;
              transition: text-decoration-color 0.2s ease-in-out;

              &:hover {
                text-decoration-color: #2f2f2b;
              }
            }

            [content] {
              display: flex;
              flex-direction: column;
              gap: 16px;

              > a {
                padding: 16px;
                display: flex;
                gap: 8px;
                border-radius: 8px;

                &:hover {
                  background: rgba(47, 47, 43, 0.08);
                }
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
    `,
  ],
})
export class DocsHeader {
  configService = inject(ConfigService);
  config = this.configService.config;
  docsUrl = computed(() => {
    return `/docs/${this.configService.config().sdk}/start/quick`;
  });
  dropdownMenu = viewChild.required(DropdownMenu);

  close() {
    this.dropdownMenu().toggle();
  }
}
