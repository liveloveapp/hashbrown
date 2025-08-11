import { Component } from '@angular/core';
import { Squircle } from '../Squircle';

@Component({
  selector: 'www-samples',
  imports: [Squircle],
  template: `
    <div class="bleed">
      <a
        href="https://github.com/liveloveapp/hashbrown"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sunshine-yellow, #fbbb52)"
      >
        <div class="header">
          <h2>Break Out of the Chat Box</h2>
          <p>
            The web is more than text and links. AI can be too. With Hashbrown,
            your users can interact with your apps using plain speech instead of
            rigid menus. The result is faster workflows, happier users, and
            products that feel fresh.
          </p>
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
          <div class="content" wwwSquircle="16 16 0 0">todo</div>
        </div>
      </a>

      <a
        href="https://github.com/liveloveapp/hashbrown"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sky-blue, #9ECFD7)"
      >
        <div class="header">
          <h2>Build Visibility Into Apps and Features</h2>
          <p>
            Apps with Hashbrown can show their work dynamically and
            automatically
          </p>
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
          <div class="content" wwwSquircle="16 16 0 0">todo</div>
        </div>
      </a>

      <a
        href="https://github.com/liveloveapp/hashbrown"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="1"
        wwwSquircleBorderColor="var(--sunset-orange, #e88c4d)"
      >
        <div class="header">
          <h2>Speed Up Workflows with AI Shortcuts</h2>
          <p>
            Traditional app navigation is cumbersome. Your users want to learn,
            explore, and do. With Hashbrown, give your users what they want
            faster and easier by predicting their next action.
          </p>
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
          <div class="content" wwwSquircle="16 16 0 0">todo</div>
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
      gap: 16px;
      padding: 32px;
      max-width: 1200px;
      width: 100%;

      > a {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 32px;
        padding: 24px;

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
            padding: 24px;
            margin: 0 4px;
            height: 100%;

            > p {
              color: var(--gray-dark, #3d3c3a);
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        padding: 64px;

        > a {
          padding: 40px;

          &:first-child {
            grid-column: 1 / 3;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 48px;
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
export class Samples {}
