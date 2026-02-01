import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { Squircle } from '../../components/Squircle';
import { TheGravy } from '../../components/TheGravy';
import { PlayerPlay } from '../../icons/PlayerPlay';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown Examples',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown Examples',
    },
    {
      name: 'og:description',
      content: 'See generative UI in action with Hashbrown.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [PlayerPlay, RouterLink, Squircle, TheGravy, Footer, Header],
  template: `
    <www-header />
    <div class="container" wwwSquircle="16 16 0 0">
      <main class="bleed">
        <div class="heading">
          <h1>
            See
            <div class="ai-underline">generative</div>
            UI <br />in Action
          </h1>
          <p>Bring the power of ChatGPT into your web apps.</p>
        </div>
        <div class="samples">
          <a routerLink="/samples/finance" wwwSquircle="16">
            <div>
              <h2>Finance App</h2>
              <p>
                Describe the chart you need, and the app transforms your words
                into polished Chart.js visualizations.
              </p>
            </div>
            <div class="pills">
              <span wwwSquircle="8">Generative UI</span>
              <span wwwSquircle="8">Streaming</span>
              <span wwwSquircle="8">JS Runtime</span>
            </div>
            <img
              src="/image/samples/finance.png"
              alt="Finance App screenshot"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="4"
              wwwSquircleBorderColor="red"
            />
            <div class="actions">
              <div class="action" wwwSquircle="8">
                <span>Run this App</span>
                <www-player-play height="16px" width="16px" />
              </div>
            </div>
          </a>
          <!-- <a routerLink="/samples/fast-food" wwwSquircle="16">
            <div>
              <h2>Fast Food App</h2>
              <p>
                Chat through menu ideas, chart nutrition tradeoffs, and explore
                50+ restaurant menus with a friendly copilot.
              </p>
            </div>
            <div class="pills">
              <span wwwSquircle="8">Generative UI</span>
              <span wwwSquircle="8">Streaming</span>
              <span wwwSquircle="8">Charts</span>
              <span wwwSquircle="8">Structured Data</span>
            </div>
            <img
              src="/image/samples/fast-food.svg"
              alt="Fast Food App screenshot"
              wwwSquircle="8"
              [wwwSquircleBorderWidth]="4"
              wwwSquircleBorderColor="orange"
            />
            <div class="actions">
              <div class="action" wwwSquircle="8">
                <span>Run this App</span>
                <www-player-play height="16px" width="16px" />
              </div>
            </div>
          </a> -->
          <a routerLink="/samples/smart-home" wwwSquircle="16">
            <div>
              <h2>Smart Home App</h2>
              <p>
                Describe the ambience you want, and the app orchestrates lights
                and scenes in real time.
              </p>
            </div>
            <div class="pills">
              <span wwwSquircle="8">Generative UI</span>
              <span wwwSquircle="8">Streaming</span>
              <span wwwSquircle="8">Structured Data</span>
              <span wwwSquircle="8">Chatbot</span>
            </div>
            <img
              src="/image/samples/smart-home.png"
              alt="Smart Home App screenshot"
            />
            <div class="actions">
              <div class="action" wwwSquircle="8">
                <span>Run this App</span>
                <www-player-play height="16px" width="16px" />
              </div>
            </div>
          </a>
        </div>
      </main>
      <www-the-gravy id="dd18d015-795c-4c3b-a7c1-3c6f73caa7f0" />
      <www-footer />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }

    .container {
      display: flex;
      flex-direction: column;
      background: #fff;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      align-self: center;
      padding: 16px 16px 64px;
      gap: 24px;

      > .heading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        align-self: center;
        padding: 16px;

        > h1 {
          color: var(--gray);
          text-align: center;
          position: relative;
          z-index: 1;
          font:
            600 24px/32px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 600;
          text-shadow: 0 0 1px var(--vanilla-ivory);

          > .ai-underline {
            display: inline-block;
            width: fit-content;

            &::after {
              content: '';
              position: relative;
              display: block;
              width: calc(100% - 20px);
              height: 3px;
              top: -5px;
              left: 20px;
              z-index: -1;
              background: var(--sunshine-yellow);
              border-radius: 2px;
              background: linear-gradient(
                90deg,
                var(--sunshine-yellow) 0%,
                var(--sunset-orange) 25%,
                var(--indian-red-light) 50%,
                var(--sky-blue) 75%,
                var(--olive-green-light) 100%
              );
              transition: width 0.5s ease;

              @starting-style {
                width: 0;
              }
            }
          }
        }

        > p {
          color: var(--gray, #5e5c5a);
          text-align: center;
          font:
            400 14px/18px 'Fredoka',
            sans-serif;
        }
      }

      > .samples {
        display: grid;
        grid-template-columns: 1fr;
        gap: 32px;
        width: 100%;

        > a {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          padding: 24px;
          gap: 32px;
          background: rgba(61, 60, 58, 0.036);
          transform: translateZ(0) scale(1);
          transition:
            transform 800ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 800ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 800ms cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: center;
          will-change: transform;
          backface-visibility: hidden;

          &:hover {
            transform: translateY(-1px) scale(1.006);
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.1);
            filter: saturate(1.04) contrast(1.02);
          }

          > div {
            display: flex;
            flex-direction: column;
            gap: 16px;

            > h2 {
              color: var(--gray, #5e5c5a);
              font:
                500 24px/32px 'Fredoka',
                sans-serif;
            }

            > p {
              color: var(--gray, #5e5c5a);
              font:
                300 18px/24px Fredoka,
                sans-serif;
            }
          }

          > .pills {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;

            > span {
              background: rgba(61, 60, 58, 0.08);
              color: var(--gray, #5e5c5a);
              font:
                500 10px/16px 'Fredoka',
                sans-serif;
              padding: 8px 16px;
              word-break: keep-all;
              white-space: nowrap;
            }
          }

          > img {
            height: auto;
            width: 80%;
            align-self: center;
            object-fit: contain;
            margin: 32px 0;
          }

          > .actions {
            flex: 1 auto;
            display: flex;
            flex-direction: row;
            justify-content: flex-end;
            align-items: flex-end;
            gap: 16px;
            margin-top: 32px;

            > .action {
              display: flex;
              align-items: center;
              gap: 4px;
              background: var(--sunshine-yellow, #fbbb52);
              padding: 8px 16px;
              border-radius: 8px;

              > span {
                color: var(--gray, #5e5c5a);
                font:
                  400 16px/24px 'Fredoka',
                  sans-serif;
              }
            }
          }
        }
      }
    }

    @media screen and (min-width: 768px) {
      .bleed {
        padding: 64px 32px;
        max-width: 1281px;
        gap: 64px;

        > .heading {
          > h1 {
            font:
              800 32px/40px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 800;

            > br {
              display: none;
            }
          }

          > p {
            font:
              400 18px/24px 'Fredoka',
              sans-serif;
          }
        }

        > .samples {
          grid-template-columns: 1fr 1fr;
        }
      }
    }
  `,
})
export default class SamplesPage {}
