import { Component } from '@angular/core';
import { ArrowUpRight } from '../../icons/ArrowUpRight';

@Component({
  selector: 'www-the-gravy',
  imports: [ArrowUpRight],
  template: `
    <div class="bleed">
      <div class="title">
        <img src="/image/thegravy/brand-and-word-mark.svg" alt="The Gravy" />
        <div>
          <p>
            Your morning helping of all things generative user interfaces,
            served fresh on Thursdays, free
          </p>
          <p class="subtitle">
            We will never spam you. You can unsubscribe at any time.
            <a href="https://thegravy.dev" target="_blank"
              >View all issues <www-arrow-up-right height="16px" width="16px"
            /></a>
          </p>
        </div>
      </div>
      <script async src="https://subscribe-forms.beehiiv.com/embed.js"></script>
      <iframe
        src="https://subscribe-forms.beehiiv.com/56612be1-e6e1-4363-ba58-bae94bb9bd47"
        class="beehiiv-embed"
        data-test-id="beehiiv-embed"
        frameborder="0"
        scrolling="no"
      ></iframe>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      justify-content: center;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 64px;
      padding: 64px 32px;
      width: 100%;
      max-width: 720px;

      > .title {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;

        > img {
          width: 160px;
          height: auto;
          flex-shrink: 0;
          aspect-ratio: 83/100;
        }

        > div {
          display: flex;
          flex-direction: column;
          gap: 4px;

          > p {
            color: var(--grey-dark, #414042);
            text-align: center;
            font:
              500 24px/32px Fredoka,
              sans-serif;

            &.subtitle {
              font:
                300 16px/24px Fredoka,
                sans-serif;

              > a {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                text-decoration: underline;
                text-decoration-color: #774625;
                color: #774625;
              }

              &:hover {
                text-decoration-color: #fbbb52;
              }
            }
          }
        }
      }

      > iframe {
        width: 100%;
        height: 50px;
        background: transparent;
      }
    }
  `,
})
export class TheGravy {}
