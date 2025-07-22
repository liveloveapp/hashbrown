import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandBlueSky } from '../icons/BrandBlueSky';
import { BrandGitHub } from '../icons/BrandGitHub';
import { BrandLinkedIn } from '../icons/BrandLinkedIn';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-footer',
  imports: [BrandBlueSky, BrandGitHub, BrandLinkedIn, RouterLink],
  template: `
    <footer>
      <div class="links">
        <div class="brand">
          <div class="title">
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
          </div>
          <small>
            © LiveLoveApp, LLC {{ currentYear }}. <br />Based in Oregon.
            <br /><a href="https://analogjs.org" target="_blank"
              >Built with AnalogJS</a
            >
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
            <li>
              <a [routerLink]="examplesUrl()" class="underline">Examples</a>
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
          <li>
            <a href="https://github.com/liveloveapp/hashbrown" target="_blank">
              <www-brand-github />
            </a>
          </li>
        </ul>
      </div>
    </footer>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="9"
      viewBox="0 0 1728 9"
      fill="none"
    >
      <g clip-path="url(#clip0_72_106)">
        <rect width="1728" height="9" fill="#3D3C3A" />
        <rect
          x="301.191"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 301.191 -124)"
          fill="#A0A985"
        />
        <rect
          x="1037.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1037.19 -124)"
          fill="#AF68B4"
        />
        <rect
          x="-66.8086"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 -66.8086 -124)"
          fill="#AF68B4"
        />
        <rect
          x="485.191"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 485.191 -124)"
          fill="#FBBB52"
        />
        <rect
          x="1221.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1221.19 -124)"
          fill="#9ECFD7"
        />
        <rect
          x="117.191"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 117.191 -124)"
          fill="#9ECFD7"
        />
        <rect
          x="669.191"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 669.191 -124)"
          fill="#E88C4D"
        />
        <rect
          x="1773.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1773.19 -124)"
          fill="#E88C4D"
        />
        <rect
          x="1405.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1405.19 -124)"
          fill="#A0A985"
        />
        <rect
          x="853.191"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 853.191 -124)"
          fill="#E27676"
        />
        <rect
          x="1957.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1957.19 -124)"
          fill="#E27676"
        />
        <rect
          x="1589.19"
          y="-124"
          width="160"
          height="614.383"
          transform="rotate(30 1589.19 -124)"
          fill="#FBBB52"
        />
      </g>
      <defs>
        <clipPath id="clip0_72_106">
          <rect width="1728" height="9" fill="white" />
        </clipPath>
      </defs>
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    footer {
      display: flex;
      flex-direction: column;
      gap: 32px;
      margin: 0 auto;
      padding: 32px;
      width: 100%;

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

              > www-brand-liveloveapp-wordmark {
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
  /**
   * Retrieves the full year (4 digits) for the current date.
   *
   * @returns {number} The current year as a four-digit number (e.g., 2025).
   */
  currentYear = new Date().getFullYear();

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
  examplesUrl = computed(() => {
    return `/examples/${this.configService.sdk()}/ui-chat`;
  });
}
