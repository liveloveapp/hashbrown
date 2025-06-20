import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-hero',
  imports: [RouterLink],
  template: `
    <div class="bleed">
      <div class="container">
        <div class="logo">
          <img
            src="/image/logo/brand-mark-alt.svg"
            alt="our friendly logo that looks like a hashbrown character from an animated tv show"
          />
          <div class="underline">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div class="cta">
          <h1>A framework for generative user interfaces</h1>
          <p>
            Hashbrown is a framework for building joyful, AI-powered user
            interfaces that predict users' next steps, speeds them through
            forms, and intelligently reorganizes views based on context. It's
            made for Angular and React, with support for large language models
            from OpenAI, Google, and Writer.
          </p>
          <a [routerLink]="docsUrl()">read the documentation</a>
        </div>
      </div>
    </div>
    <div class="divider-1"></div>
    <div class="divider-2"></div>
    <div class="divider-3"></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #fbbb52;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      padding: 48px 32px;
      width: 100%;
      max-width: 962px;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: 48px;

      > .logo {
        display: none;
      }

      > .cta {
        display: flex;
        flex-direction: column;
        gap: 16px;

        > h1 {
          color: #774625;
          font:
            400 32px/40px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 800;
        }

        > p {
          color: rgba(0, 0, 0, 0.64);
          font:
            400 18px/24px 'Fredoka',
            sans-serif;
        }

        a {
          display: flex;
          justify-content: center;
          align-items: center;
          align-self: flex-start;
          color: rgba(255, 255, 255, 0.88);
          font:
            500 18px/24px 'Fredoka',
            sans-serif;
          padding: 12px 24px;
          border-radius: 48px;
          border: 6px solid #e8a23d;
          background: #e88c4d;
          transition:
            color 0.2s ease-in-out,
            border 0.2s ease-in-out;

          &:hover {
            color: #fff;
          }
        }
      }
    }

    .divider-1,
    .divider-2,
    .divider-3 {
      width: 100%;
      height: 12px;
    }

    .divider-1 {
      background: #e88c4d;
    }

    .divider-2 {
      background: #b86060;
    }

    .divider-3 {
      background: #9ecfd7;
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 96px 64px;
      }

      .container {
        flex-direction: row;
        gap: 96px;

        > .logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          img {
            width: 180px;
          }

          > .underline {
            display: inline-flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-end;
            border-radius: 8px;
            overflow: hidden;

            > span {
              width: 176px;
              height: 8px;

              &:nth-child(1) {
                background: linear-gradient(
                  90deg,
                  rgba(232, 140, 77, 0) 0%,
                  #e88c4d 100%
                );
              }

              &:nth-child(2) {
                background: linear-gradient(
                  90deg,
                  rgba(184, 96, 96, 0) 0%,
                  #b86060 100%
                );
              }

              &:nth-child(3) {
                background: linear-gradient(
                  90deg,
                  rgba(158, 207, 215, 0) 0%,
                  #9ecfd7 100%
                );
              }
            }
          }
        }

        > .cta {
          > h1 {
            font:
              400 48px/56px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 800;
          }
        }
      }
    }
  `,
})
export class Hero {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
}
