import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Angular } from '../icons/Angular';
import { BrandGoogle } from '../icons/BrandGoogle';
import { BrandOpenAi } from '../icons/BrandOpenAi';
import { BrandWriter } from '../icons/BrandWriter';
import { React } from '../icons/React';

@Component({
  selector: 'www-providers',
  imports: [Angular, React, BrandOpenAi, BrandGoogle, BrandWriter, RouterLink],
  template: `
    <div class="bleed">
      <div class="banner">
        <div class="served">
          <h2>Served With</h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1"
            height="50"
            viewBox="0 0 1 50"
            fill="none"
            class="right"
          >
            <path d="M1 1L0 0V49L1 50V1Z" fill="#E8E4DD" />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="1"
            viewBox="0 0 128 1"
            fill="none"
            class="bottom"
          >
            <path d="M128 1H0L1 0H127L128 1Z" fill="#D9D9D9" />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1"
            height="50"
            viewBox="0 0 1 50"
            fill="none"
            class="left"
          >
            <path d="M0 1L1 0V49L0 50V1Z" fill="#E8E4DD" />
          </svg>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="31"
          height="38"
          viewBox="0 0 31 38"
          fill="none"
          class="left-hook"
        >
          <g>
            <circle cx="15" cy="30.5" r="5" fill="#908D87" />
            <circle cx="15" cy="31" r="5" fill="#FAF9F0" />
            <rect x="13" y="-13" width="4" height="50" rx="2" fill="#AD907C" />
            <path
              d="M2.78223 21.1025V33.8203H10.8711C11.7717 35.1363 13.2849 36 15 36C16.7151 36 18.2283 35.1363 19.1289 33.8203H27.8203V21.1025H31V37.3975H0V21.1025H2.78223Z"
              fill="white"
            />
          </g>
        </svg>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="31"
          height="38"
          viewBox="0 0 31 38"
          fill="none"
          class="right-hook"
        >
          <g>
            <circle cx="15" cy="30.5" r="5" fill="#908D87" />
            <circle cx="15" cy="31" r="5" fill="#FAF9F0" />
            <rect x="13" y="-13" width="4" height="50" rx="2" fill="#AD907C" />
            <path
              d="M2.78223 21.1025V33.8203H10.8711C11.7717 35.1363 13.2849 36 15 36C16.7151 36 18.2283 35.1363 19.1289 33.8203H27.8203V21.1025H31V37.3975H0V21.1025H2.78223Z"
              fill="white"
            />
          </g>
        </svg>
      </div>
      <div class="providers">
        <a routerLink="/docs/angular/start/quick" class="angular">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
          >
            <path
              d="M40 0C65 0 80 15 80 40C80 65 60 80 40 80C20 80 0 65 0 40C0 15 15 0 40 0Z"
              fill="#B86060"
            />
          </svg>
          <www-angular fill="#fff" class="icon" />
        </a>
        <a routerLink="/docs/react/start/quick" class="react">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="75"
            height="84"
            viewBox="0 0 75 84"
            fill="none"
          >
            <path
              d="M38.0002 2.99996C68.0002 6.99996 80.0002 35 73.0002 60C66.0002 83 48.0002 87 28.0002 80C3.0002 73 -3.9998 40 3.0002 15C10.0002 -3.00004 33.0002 -1.00004 38.0002 2.99996Z"
              fill="#64AFB5"
            />
          </svg>
          <www-react fill="#fff" class="icon" />
        </a>
        <div class="open-ai">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="77"
            height="82"
            viewBox="0 0 77 82"
            fill="none"
          >
            <path
              d="M37.9998 3.00005C55.9998 -3.99995 77.9998 6.00005 72.9998 26.0001C82.9998 51.0001 67.9998 79.0001 42.9998 81.0001C19.9998 83.0001 -2.0002 66.0001 2.9998 41.0001C-7.0002 21.0001 17.9998 -0.999948 37.9998 3.00005Z"
              fill="#616F36"
            />
          </svg>
          <www-brand-openai class="icon" />
        </div>
        <div class="google">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="74"
            height="84"
            viewBox="0 0 74 84"
            fill="none"
          >
            <path
              d="M37.0001 0C72.0002 0 82.0001 25 67.0001 45C73.0001 75 47.0001 90 22.0001 80C-2.99985 70 -4.99985 40 12.0001 15C27.0001 0 37.0001 0 37.0001 0Z"
              fill="#E88C4D"
            />
          </svg>
          <www-brand-google class="icon" />
        </div>
        <div class="writer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="71"
            height="79"
            viewBox="0 0 71 79"
            fill="none"
          >
            <path
              d="M38.9999 4.99999C68.9999 9.99999 78.9999 35 63.9999 60C58.9999 80 33.9999 85 13.9999 70C-6.00011 50 -1.00011 20 13.9999 4.99999C23.9999 -5.00001 38.9999 4.99999 38.9999 4.99999Z"
              fill="#FBBB52"
            />
          </svg>
          <www-brand-writer class="icon" />
        </div>
      </div>
      <div class="divider"></div>
      <p class="welcome">
        You know that spark of joy you feel when GitHub Copilot nails your
        function implementation or ChatGPT delivers the perfect response?
        hashbrown brings that same delight to your apps —
        <em>
          built for developers who see AI as a helpful technology in creating
          friendlier, more accessible software</em
        >.
      </p>
    </div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: flex;
        justify-content: center;
        width: 100%;
        background: #faf9f0;
      }

      .bleed {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 64px;
        padding: 64px 32px;
        width: 100%;
        max-width: 720px;
      }

      .banner {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);

        > .served {
          position: absolute;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          justify-content: center;
          align-items: flex-end;
          padding: 0 0 12px;
          height: 50px;
          width: 128px;
          background: #fff;
          color: rgba(94, 92, 90, 0.8);
          font:
            900 italic 14px/16px Poppins,
            sans-serif;
          text-transform: uppercase;

          > .right {
            position: absolute;
            right: -1px;
            top: 0;
            width: 1px;
            height: 50px;
            background: #e8e4dd;
          }

          > .bottom {
            position: absolute;
            bottom: -1px;
            left: 0;
            width: 128px;
            height: 1px;
            background: #d9d9d9;
          }

          > .left {
            position: absolute;
            left: -1px;
            top: 0;
            width: 1px;
            height: 50px;
            background: #e8e4dd;
          }
        }

        > .left-hook {
          position: absolute;
          left: 18px;
          top: 0;
          width: 31px;
          height: 38px;
        }

        > .right-hook {
          position: absolute;
          right: 18px;
          top: 0;
          width: 31px;
          height: 38px;
        }
      }

      .providers {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 24px;
        margin-top: 64px;
        color: #fff;

        > a,
        > div {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 40px;
          height: 40px;
          border-radius: 64px;

          > svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
          }

          > .icon {
            z-index: 1;
          }
        }
      }

      .divider {
        width: 128px;
        height: 1px;
        background: rgba(119, 70, 37, 0.24);
      }

      .welcome {
        color: #5e5c5a;
        text-align: center;
        font:
          500 18px/32px Poppins,
          sans-serif;

        > em {
          color: #e8a23d;
        }
      }

      @media screen and (min-width: 1024px) {
        .bleed {
          padding: 128px 64px;
        }

        .providers {
          gap: 32px;

          > a,
          > div {
            height: 80px;
            width: 80px;
          }
        }
      }
    `,
  ],
})
export class Providers {}
