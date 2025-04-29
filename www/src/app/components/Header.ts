import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KeyboardIcon } from '../icons/KeyboardIcon';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-header',
  imports: [RouterLink, KeyboardIcon],
  template: `
    <header>
      <a routerLink="/">Hashbrown 🥔</a>
      <nav>
        <ul>
          <li>
            <button (click)="onSearch()">
              <www-keyboard-icon />
            </button>
          </li>
          <li><a routerLink="/ref" class="underline">api</a></li>
          <li>
            <a [routerLink]="docsUrl()" class="underline">docs</a>
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

            > button {
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
