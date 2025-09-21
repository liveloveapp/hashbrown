import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../../components/Header';
import { Squircle } from '../../components/Squircle';
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
  imports: [Header, PlayerPlay, RouterLink, Squircle],
  template: `
    <www-header />
    <div class="container" wwwSquircle="16 16 0 0">
      <div class="bleed">
        <div class="heading">
          <h1>
            See
            <div class="ai-underline">generative</div>
            UI in Action
          </h1>
          <p>Build the next generation of web apps with Hashbrown.</p>
        </div>
        <div class="samples">
          <a
            routerLink="/samples/finance"
            wwwSquircle="16"
            [wwwSquircleBorderWidth]="8"
            wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
          >
            <div class="window">
              <div class="nav">
                <div class="button">
                  <h3>Finance App</h3>
                </div>
              </div>
              <div class="body" wwwSquircle="16 16 0 0">
                <img
                  src="/image/landing-page/yellow-box-demo.svg"
                  alt="Render a chart in response to natural language"
                />
              </div>
            </div>
            <div class="content">
              <div>
                <h2>Finance App</h2>
                <p>
                  Describe the chart you need, and the app transforms your words
                  into polished Chart.js visualizations that are safely
                  generated and executed with Hashbrown's typed, sandboxed
                  JavaScript runtime.
                </p>
              </div>
              <div class="pills">
                <span wwwSquircle="8">Generative UI</span>
                <span wwwSquircle="8">Streaming</span>
                <span wwwSquircle="8">JS Runtime</span>
              </div>
              <div class="actions">
                <div class="action" wwwSquircle="8">
                  <span>Run this App</span>
                  <www-player-play height="16px" width="16px" />
                </div>
              </div>
            </div>
          </a>
          <a
            routerLink="/samples/smart-home"
            wwwSquircle="16"
            [wwwSquircleBorderWidth]="8"
            wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
          >
            <div class="window">
              <div class="nav">
                <div class="button">
                  <h3>Smart Home App</h3>
                </div>
              </div>
              <div class="body" wwwSquircle="16 16 0 0">
                <img
                  src="/image/landing-page/red-box-demo.svg"
                  alt="Instantly predict the next action"
                />
              </div>
            </div>
            <div class="content">
              <div>
                <h2>Smart Home App</h2>
                <p>
                  Describe the ambience you want, and the app orchestrates
                  lights and scenes in real time powered by Hashbrown's
                  generative UI with streaming chat, predictive suggestions, and
                  safe tool calls for instant control.
                </p>
              </div>
              <div class="pills">
                <span wwwSquircle="8">Generative UI</span>
                <span wwwSquircle="8">Streaming</span>
                <span wwwSquircle="8">Structured Data</span>
                <span wwwSquircle="8">Chatbot</span>
              </div>
              <div class="actions">
                <div class="action" wwwSquircle="8">
                  <span>Run this App</span>
                  <www-player-play height="16px" width="16px" />
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
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
      height: 100%;
      background: #fff;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      align-self: center;
      padding: 16px;
      gap: 48px;

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
            800 32px/40px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 800;
          text-shadow: 0 0 1px var(--vanilla-ivory);

          .ai-underline {
            display: inline-block;
            width: fit-content;
          }

          .ai-underline:after {
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

        > p {
          color: var(--gray, #5e5c5a);
          text-align: center;
          font:
            500 18px/24px 'Fredoka',
            sans-serif;
        }
      }

      > .samples {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        width: 100%;

        > a {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          height: 100%;
          transition: transform 0.16s ease-in-out;

          &:hover {
            transform: scale(1.006);
          }

          > .window {
            flex: 1 auto;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            background: var(--gray, #5e5c5a);
            position: relative;

            > .nav {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 16px 32px;

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
                  color: var(--vanilla-ivory, #faf9f0);
                  font:
                    500 12px/16px Fredoka,
                    sans-serif;
                }
              }
            }

            > .body {
              flex: 1 auto;
              display: flex;
              flex-direction: column;
              align-items: stretch;
              gap: 16px;
              background: #fff;
              padding: 16px;
              margin: 0 4px;
              height: 100%;

              > img {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
            }
          }

          > .content {
            display: flex;
            flex-direction: column;
            padding: 32px;
            gap: 16px;
            border-top: 1px solid var(--gray, #5e5c5a);

            > div {
              display: flex;
              flex-direction: column;
              gap: 4px;

              > h2 {
                color: var(--gray, #5e5c5a);
                font:
                  500 24px/32px 'Fredoka',
                  sans-serif;
              }

              > p {
                color: var(--gray-dark, #3d3c3a);
                font:
                  400 15px/24px Fredoka,
                  sans-serif;
              }
            }

            > .pills {
              display: flex;
              flex-direction: row;
              align-items: center;
              gap: 8px;

              > span {
                background: var(--sky-blue-light, #d8ecef);
                color: var(--gray, #5e5c5a);
                font:
                  400 11px/16px 'Fredoka',
                  sans-serif;
                padding: 4px 8px;
              }
            }

            > .actions {
              display: flex;
              flex-direction: row;
              justify-content: flex-end;
              align-items: center;
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

                > www-player-play {
                  height: 16px;
                  width: 16px;
                }
              }
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 32px;
        max-width: 1024px;
      }
    }
  `,
})
export default class SamplesPage {}
