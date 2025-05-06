import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandBlueSky } from '../icons/BrandBlueSky';
import { BrandLinkedIn } from '../icons/BrandLinkedIn';
import { LiveLoveApp } from '../icons/LiveLoveApp';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-footer',
  imports: [RouterLink, BrandBlueSky, BrandLinkedIn, LiveLoveApp],
  template: `
    <footer>
      <div class="links">
        <div class="brand">
          <div class="title">
            <span>Cooked up by</span>
            <a href="https://liveloveapp.com"><www-liveloveapp /></a>
          </div>
          <small>
            LiveLoveApp is a team of engineers who bring data to life on the web
            using AI.
          </small>
        </div>
        <div class="docs">
          <div class="title">Documentation</div>
          <ul>
            <li>
              <a [routerLink]="docsUrl()" class="underline">Docs</a>
            </li>
            <li>
              <a routerLink="/api" class="underline">API Reference</a>
            </li>
          </ul>
        </div>
        <div class="enterprise">
          <div class="title">Enterprise</div>
          <ul>
            <li>
              <a routerLink="/enterprise" class="underline">
                Enterprise Support
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div class="bottom">
        <span></span>
        <ul>
          <li>
            <a href="https://bsky.app/profile/liveloveapp.dev" target="_blank">
              <www-brand-blue-sky />
            </a>
          </li>
          <li>
            <a
              href="https://www.linkedin.com/company/liveloveapp"
              target="_blank"
            >
              <www-brand-linkedin />
            </a>
          </li>
        </ul>
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }

    footer {
      display: flex;
      flex-direction: column;
      gap: 32px;
      margin: 0 auto;
      padding: 32px;

      > .links {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 16px;
        row-gap: 16px;

        > .brand {
          grid-column: span 12;
          display: flex;
          flex-direction: column;
          gap: 8px;

          > .title {
            display: flex;
            align-items: center;
            gap: 6px;
            font:
              500 24px/32px Fredoka,
              sans-serif;
            color: #5e5c5a;

            > a {
              display: flex;
              align-items: center;

              > www-liveloveapp {
                margin-top: 4px;
              }
            }
          }

          > small {
            font: 400 14px/20px sans-serif;
            color: rgba(61, 60, 58, 0.72);
          }
        }

        > .docs {
          grid-column: span 6;
        }

        > .enterprise {
          grid-column: span 6;
        }

        > .docs,
        > .enterprise {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > .title {
            font:
              600 14px/18px Poppins,
              sans-serif;
          }

          > ul {
            font:
              400 14px/18px Poppins,
              sans-serif;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
        }
      }

      > .bottom {
        display: flex;
        justify-content: space-between;
        align-items: center;

        > ul {
          display: flex;
          gap: 16px;

          > li {
            > a {
              display: block;
              width: 24px;
              height: 24px;
            }
          }
        }
      }
    }

    @media screen and (min-width: 768px) {
      footer {
        > .links {
          > .brand {
            grid-column: span 3;
          }

          > .docs {
            grid-column: 7 / span 3;
          }

          > .enterprise {
            grid-column: 10 / span 3;
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      footer {
        > .links {
          > .brand {
            grid-column: span 4;
          }

          > .docs {
            grid-column: 9 / span 2;
          }

          > .enterprise {
            grid-column: 11 / span 2;
          }
        }
      }
    }
  `,
})
export class Footer {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.config().sdk}/start/quick`;
  });
}
