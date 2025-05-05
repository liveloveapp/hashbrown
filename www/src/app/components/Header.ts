import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KeyboardIcon } from '../icons/KeyboardIcon';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-header',
  imports: [RouterLink, KeyboardIcon],
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
        <input placeholder="Search" />
        <label>
          <www-keyboard-icon />
        </label>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        background: #fff;
      }

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
      }

      @media print {
        header {
          display: none;
        }
      }
    `,
  ],
})
export class Header {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.config().sdk}/start/quick`;
  });

  onSearch() {
    console.warn('Not implemented');
  }
}
