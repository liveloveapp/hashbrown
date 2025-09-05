import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { Squircle } from '../Squircle';

@Component({
  selector: 'www-samples',
  imports: [RouterLink, Squircle],
  template: `
    <div class="bleed">
      <a
        [routerLink]="[docsUrl(), 'recipes', 'ui-chatbot']"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sunshine-yellow, #fbbb52)"
      >
        <div class="header">
          <h2>Generate UI, Not Just Text</h2>
          <p>
            With Hashbrown, large language models compose real views from your
            components and stream them into the page. Interfaces stay on-brand,
            context-aware, and production-ready.
          </p>
          <div class="gap"></div>
          <small
            >Learn how to build a chatbot with Generative UI and Tool
            Calling</small
          >
        </div>
        <div
          class="window"
          wwwSquircle="16 16 0 0"
          [wwwSquircleBorderWidth]="8"
          wwwSquircleBorderColor="rgba(251, 187, 82, 0.48)"
        >
          <div class="nav">
            <div class="button">
              <h3>Finance Sample</h3>
            </div>
          </div>
          <div class="content" wwwSquircle="16 16 0 0">
            <img
              src="/image/landing-page/yellow-box-demo.svg"
              alt="Render a chart in response to natural language"
            />
          </div>
        </div>
      </a>

      <a
        [routerLink]="[
          docsUrl(),
          'recipes',
          'natural-language-to-structured-data',
        ]"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sky-blue, #9ECFD7)"
      >
        <div class="header">
          <h2>Turn Language into Data</h2>
          <p>
            Use Hashbrown to turn natural language into strongly typed data and
            build friendlier apps. Streaming primitives keep interactions fast,
            responsive, and type-safe.
          </p>
          <div class="gap"></div>
          <small
            >Learn how to convert natural language into structured data</small
          >
        </div>
        <div
          class="window"
          wwwSquircle="16 16 0 0"
          [wwwSquircleBorderWidth]="8"
          wwwSquircleBorderColor="rgba(158, 207, 215, 0.48)"
        >
          <div class="nav">
            <div class="button">
              <h3>Finance Sample</h3>
            </div>
          </div>
          <div class="content" wwwSquircle="16 16 0 0">
            <img
              src="/image/landing-page/blue-box-demo.svg"
              alt="Turn natural language into strongly typed data"
            />
          </div>
        </div>
      </a>

      <a
        [routerLink]="[docsUrl(), 'concept', 'structured-output']"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sunset-orange, #e88c4d)"
      >
        <div class="header">
          <h2>Instantly Predict the Next Action</h2>
          <p>
            Skip menus and dead ends. Use Hashbrown to suggest the right next
            step from context, whether it's navigation, filling a form, or
            kicking off a task, so your users stay in the flow.
          </p>
          <div class="gap"></div>
          <small>Learn the basics of generating structured output</small>
        </div>
        <div
          class="window"
          wwwSquircle="16 16 0 0"
          [wwwSquircleBorderWidth]="8"
          wwwSquircleBorderColor="rgba(232, 140, 77, 0.48)"
        >
          <div class="nav">
            <div class="button">
              <h3>Smart Home Sample</h3>
            </div>
          </div>
          <div class="content" wwwSquircle="16 16 0 0">
            <img
              src="/image/landing-page/red-box-demo.svg"
              alt="Instantly predict the next action"
            />
          </div>
        </div>
      </a>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .bleed {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      padding: 16px;
      max-width: 1200px;
      width: 100%;

      > a {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 32px;
        padding: 16px;

        &:hover {
          > .header {
            > small {
              color: var(--gray-dark, #3d3c3a);
            }
          }
        }

        &:first-child {
          background: var(--sunshine-yellow-light, #fde4ba);
        }

        &:nth-child(2) {
          background: var(--sky-blue-light, #d8ecef);
        }

        &:nth-child(3) {
          background: var(--sunset-orange-light, #f6d1b8);
        }

        > .header {
          align-self: stretch;
          display: flex;
          flex-direction: column;
          gap: 8px;

          > h2 {
            color: rgba(0, 0, 0, 0.56);
            text-align: center;
            font:
              750 20px/24px KefirVariable,
              sans-serif;
            font-variation-settings: 'wght' 750;
          }

          > p {
            color: var(--gray-dark, #3d3c3a);
            font:
              400 15px/24px Fredoka,
              sans-serif;
          }

          > .gap {
            flex: 1 auto;
          }

          > small {
            text-decoration: underline;
            text-decoration-color: var(--gray, #5e5c5a);
            color: var(--gray, #5e5c5a);
            font:
              400 14px/24px Fredoka,
              sans-serif;

            &:hover {
              text-decoration-color: #fbbb52;
            }
          }
        }

        > .window {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          background: var(--vanilla-ivory, #faf9f0);
          margin-bottom: -23px;
          height: calc(100% + 23px);

          > .nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;

            > .button {
              position: relative;

              &::before {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 3px;
                margin-bottom: -16px;
                border-radius: 1px;
                background: linear-gradient(
                  to right,
                  #fbbb52 0%,
                  var(--sunset-orange) 25%,
                  var(--indian-red-light) 50%,
                  var(--sky-blue-dark) 75%,
                  var(--olive-green-light) 100%
                );
                background-clip: border-box;
              }
              > h3 {
                color: var(--gray, #5e5c5a);
                font:
                  500 12px/16px Fredoka,
                  sans-serif;
              }
            }
          }

          > .content {
            flex: 1 auto;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
            background: #fff;
            padding: 0;
            margin: 0 4px;
            height: 100%;

            > img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 64px;

        > a {
          padding: 40px;
          transition: transform 0.34s ease-in-out;

          &:hover {
            transform: scale(1.012);
          }

          &:first-child {
            grid-column: 1 / 3;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 48px;
          }

          > .header {
            > h2 {
              text-align: left;
            }
          }

          > .window {
            margin-bottom: -39px;
            height: calc(100% + 39px);
          }
        }
      }
    }
  `,
})
export class Samples {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}`;
  });
}
