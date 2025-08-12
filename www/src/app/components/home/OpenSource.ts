import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-open-source',
  imports: [RouterLink],
  template: `
    <div class="bleed">
      <h2>
        <span>1</span><span>0</span><span>0</span><span>%</span>&nbsp;<span
          >o</span
        ><span>p</span><span>e</span><span>n</span>&nbsp;<span>s</span
        ><span>o</span><span>u</span><span>r</span><span>c</span><span>e</span>
      </h2>
      <p>
        Hashbrown, our demos, and our prompts are free, MIT-licensed, and
        open-source.<br /><span
          >You bring your own LLM providers and server-side stack. If you'd like
          to support the project, please consider
          <a routerLink="/products/workshops" class="product"
            >attending our workshops</a
          >, or
          <a
            href="https://github.com/liveloveapp/hashbrown"
            rel="noopener"
            target="_blank"
            class="github"
            >sponsoring us on GitHub</a
          >.</span
        >
      </p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 128px 16px;
      width: 100%;

      > h2 {
        font:
          700 32px/48px Fredoka,
          sans-serif;

        > span:nth-child(1) {
          color: var(--sunshine-yellow-dark, #e8a23d);
        }
        > span:nth-child(2) {
          color: var(--sunset-orange, #e88c4d);
        }
        > span:nth-child(3) {
          color: var(--indian-red, #b86060);
        }
        > span:nth-child(4) {
          color: var(--olive-green, #616f36);
        }
        > span:nth-child(5) {
          color: var(--sky-blue-dark, #64afb5);
        }
        > span:nth-child(6) {
          color: var(--sunshine-yellow-dark, #e8a23d);
        }
        > span:nth-child(7) {
          color: var(--sunset-orange, #e88c4d);
        }
        > span:nth-child(8) {
          color: var(--indian-red, #b86060);
        }
        > span:nth-child(9) {
          color: var(--olive-green, #616f36);
        }
        > span:nth-child(10) {
          color: var(--sky-blue-dark, #64afb5);
        }
        > span:nth-child(11) {
          color: var(--sunshine-yellow-dark, #e8a23d);
        }
        > span:nth-child(12) {
          color: var(--sunset-orange, #e88c4d);
        }
        > span:nth-child(13) {
          color: var(--indian-red, #b86060);
        }
        > span:nth-child(14) {
          color: var(--olive-green, #616f36);
        }
      }

      > p {
        color: var(--gray-dark, #3d3c3a);
        text-align: center;
        font:
          500 14px/18px Fredoka,
          sans-serif;

        > span {
          display: none;
        }

        > a {
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color ease-in-out 0.2s;

          &.product {
            color: var(--sunset-orange, #e88c4d);

            &:hover {
              text-decoration-color: var(--sunset-orange, #e88c4d);
            }
          }

          &.github {
            color: var(--sky-blue-dark, #64afb5);

            &:hover {
              text-decoration-color: var(--sky-blue-dark, #64afb5);
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        max-width: 800px;
        padding: 128px 32px 160px;
        gap: 16px;

        > h2 {
          font:
            700 64px/72px Fredoka,
            sans-serif;
        }

        > p {
          font:
            500 18px/24px Fredoka,
            sans-serif;

          > span {
            display: inline;
          }
        }
      }
    }
  `,
})
export class OpenSource {}
