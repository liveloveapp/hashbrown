import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { BrandBlueSky } from '../icons/BrandBlueSky';
import { BrandGitHub } from '../icons/BrandGitHub';
import { BrandLinkedIn } from '../icons/BrandLinkedIn';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-footer',
  imports: [ArrowUpRight, BrandBlueSky, BrandGitHub, BrandLinkedIn, RouterLink],
  template: `
    <footer>
      <div class="links">
        <div class="brand">
          <div class="title">
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
          </div>
          <small>
            © LiveLoveApp, LLC {{ currentYear }}. <br />
            <a href="https://analogjs.org" target="_blank">
              Built with AnalogJS
              <www-arrow-up-right height="12px" width="12px" />
            </a>
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
              <a routerLink="/samples" class="underline">Examples</a>
            </li>
            <li>
              <a href="/llms.txt" target="_blank" class="underline">
                llms.txt
                <www-arrow-up-right height="12px" width="12px" />
              </a>
            </li>
            <li>
              <a href="/llms-full.txt" target="_blank" class="underline">
                llms-full.txt
                <www-arrow-up-right height="12px" width="12px" />
              </a>
            </li>
          </ul>
        </div>
        <div class="learn">
          <div class="title">Learn</div>
          <ul>
            <li>
              <a
                routerLink="/workshops/react-generative-ui-engineering"
                class="underline"
                >React Workshop</a
              >
            </li>
            <li>
              <a
                routerLink="/workshops/angular-generative-ui-engineering"
                class="underline"
                >Angular Workshop</a
              >
            </li>
          </ul>
        </div>
        <div class="contact">
          <div class="title">Contact</div>
          <ul>
            <li>
              <a routerLink="/contact-us" class="underline">Contact sales</a>
            </li>
            <li>
              <a href="mailto:hello@liveloveapp.com" class="underline">
                <span>hello&#64;liveloveapp.com</span>
                <span>Email us</span>
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
      border-top: 1px solid rgba(61, 60, 58, 0.24);
    }

    footer {
      display: flex;
      flex-direction: column;
      gap: 32px;
      margin: 0 auto;
      padding: 24px;
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
            font:
              300 11px/16px Fredoka,
              sans-serif;
            color: rgba(61, 60, 58, 0.64);

            > a {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              text-decoration: underline;
              text-decoration-color: transparent;
              transition: text-decoration-color 0.2s ease-in-out;

              &:hover {
                text-decoration-color: rgba(61, 60, 58, 0.64);
              }
            }
          }
        }

        > .docs {
          grid-column: span 6;
        }

        > .learn {
          grid-column: span 6;
        }

        > .docs,
        > .learn,
        > .contact {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > .title {
            font:
              600 14px/18px Fredoka,
              sans-serif;
          }

          > ul {
            font:
              400 14px/18px Fredoka,
              sans-serif;
            display: flex;
            flex-direction: column;
            gap: 4px;

            > li {
              > a {
                display: inline-flex;
                align-items: center;
                gap: 4px;

                > span:first-child {
                  display: block;
                }

                > span:last-child {
                  display: none;
                }
              }
            }
          }
        }

        > .contact {
          grid-column: span 12;
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

    @media screen and (min-width: 768px) and (max-width: 1023px) {
      footer {
        > .links {
          > .contact {
            > ul {
              > li {
                > a {
                  > span:first-child {
                    display: none;
                  }

                  > span:last-child {
                    display: block;
                  }
                }
              }
            }
          }

          > .brand {
            grid-column: span 3;
          }

          > .docs {
            grid-column: 5 / span 2;
          }

          > .learn {
            grid-column: 8 / span 2;
          }

          > .contact {
            grid-column: 11 / span 2;
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      footer {
        padding: 64px 24px 24px;
        > .links {
          > .brand {
            grid-column: span 4;
          }

          > .docs {
            grid-column: 7 / span 2;
          }

          > .learn {
            grid-column: 9 / span 2;
          }

          > .contact {
            grid-column: 11 / span 2;
          }
        }
      }
    }
  `,
})
export class Footer {
  configService = inject(ConfigService);
  currentYear = new Date().getFullYear();

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/intro`;
  });
}
