import { Component, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Angular } from '../icons/Angular';
import { React } from '../icons/React';
import { ConfigService } from '../services/ConfigService';
import { DropdownMenu } from './DropDownMenu';

@Component({
  selector: 'www-examples-header',
  imports: [RouterLink, DropdownMenu, Angular, React],
  template: `
    <header>
      <div class="left">
        <a routerLink="/">
          <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
        </a>
      </div>
      <div class="right">
        <nav>
          <ul>
            <li>
              <a [routerLink]="docsUrl()" class="underline">docs</a>
            </li>
            <li><a routerLink="/api" class="underline">api</a></li>
            <li>
              <a [routerLink]="examplesUrl()" class="underline">example</a>
            </li>
            <li>
              <a routerLink="/enterprise" class="underline">enterprise</a>
            </li>
            <li>
              <www-dropdown-menu [placement]="['right', 'bottom']">
                @switch (sdk()) {
                  @case ('angular') {
                    <label>
                      <www-angular height="16px" width="16px" fill="#774625" />
                      Angular
                    </label>
                  }
                  @case ('react') {
                    <label>
                      <www-react height="16px" width="16px" fill="#774625" />
                      React
                    </label>
                  }
                }
                <div content>
                  <a routerLink="/examples/angular/ui-chat" (click)="close()">
                    <www-angular fill="#774625" />
                    Angular
                  </a>
                  <a routerLink="/examples/react/ui-chat" (click)="close()">
                    <www-react fill="#774625" />
                    React
                  </a>
                </div>
              </www-dropdown-menu>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        background: #e8a23d;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px 32px;

        > .left {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        > .right {
          > nav {
            > ul {
              display: flex;
              align-items: center;
              gap: 32px;

              > li {
                display: flex;
                justify-content: center;
                align-items: center;

                > a {
                  font:
                    600 16px/16px 'KefirVariable',
                    sans-serif;
                  color: #774625;
                  font-variation-settings: 'wght' 700;
                  text-decoration: underline;
                  text-decoration-color: transparent;
                  transition: text-decoration-color ease-in-out 0.2s;

                  &:hover {
                    text-decoration-color: #774625;
                  }
                }

                > www-dropdown-menu {
                  label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font: 600 16px/24px sans-serif;
                    color: #774625;
                    text-decoration-line: underline;
                    text-decoration-color: transparent;
                    transition: text-decoration-color 0.2s ease-in-out;

                    &:hover {
                      text-decoration-color: #774625;
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
export class ExamplesHeader {
  configService = inject(ConfigService);
  sdk = this.configService.sdk;
  docsUrl = computed(() => {
    return `/docs/${this.sdk()}/start/quick`;
  });
  examplesUrl = computed(() => {
    return `/examples/${this.sdk()}/ui-chat`;
  });
  dropdownMenu = viewChild.required(DropdownMenu);

  close() {
    this.dropdownMenu().toggle();
  }
}
