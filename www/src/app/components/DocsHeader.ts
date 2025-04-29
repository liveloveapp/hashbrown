import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Angular } from '../icons/Angular';
import { KeyboardIcon } from '../icons/KeyboardIcon';
import { React } from '../icons/React';
import { Search } from '../icons/Search';
import { ConfigService } from '../services/ConfigService';
import { DropdownMenu } from './DropDownMenu';

@Component({
  selector: 'www-docs-header',
  imports: [RouterLink, Search, DropdownMenu, Angular, React, KeyboardIcon],
  template: `
    <header>
      <a routerLink="/">Hashbrown 🥔</a>
      <nav>
        <ul>
          <li>
            <button>
              <www-keyboard-icon />
            </button>
          </li>
          <li><a routerLink="/ref" class="underline">api</a></li>
          <li>
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
          </li>
        </ul>
      </nav>
    </header>
  `,
  styles: [
    `
      header {
        display: flex;
        justify-content: space-between;
        padding: 32px;
        border-bottom: 1px solid #f4f4f41f;
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

            www-dropdown-menu {
              label {
                display: flex;
                align-items: center;
                gap: 8px;
                text-decoration-line: underline;
                text-decoration-color: transparent;
                transition: text-decoration-color 0.2s ease-in-out;

                &:hover {
                  text-decoration-color: #fff;
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

                  &:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                  }
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
  dropdownMenu = viewChild.required(DropdownMenu);

  close() {
    this.dropdownMenu().toggle();
  }
}
