import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Hashbrown } from '../icons/Hashbrown';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-header',
  imports: [RouterLink, Hashbrown],
  template: `
    <header>
      <div class="left">
        <a routerLink="/">
          <img
            class="shake"
            src="/logo/hashbrown.png"
            alt="our friendly logo that looks like a hashbrown character from an animated tv show"
            height="47"
            width="48"
          />
          <www-hashbrown height="24" width="137.91" stroke="#e8a23d" />
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
                  font:
                    600 16px/24px Poppins,
                    sans-serif;
                  color: #774625;
                  text-decoration: underline;
                  text-decoration-color: transparent;
                  transition: text-decoration-color ease-in-out 0.2s;

                  &:hover {
                    text-decoration-color: #774625;
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
export class Header {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
  examplesUrl = computed(() => {
    return `/examples/${this.configService.sdk()}/chat`;
  });
}
