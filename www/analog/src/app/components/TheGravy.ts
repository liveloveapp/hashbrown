import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ArrowUpRight } from '../icons/ArrowUpRight';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-the-gravy',
  imports: [ArrowUpRight, RouterLink, Squircle],
  template: `
    <div class="bleed">
      <div class="title">
        <img src="/image/thegravy/brand-and-word-mark.svg" alt="The Gravy" />
        <div>
          <h2>
            Staying on top of JS + AI has never been tastier.
            <br />Served fresh on Thursdays. Free.
          </h2>
          <p>
            <a href="https://thegravy.dev" target="_blank">
              View all issues <www-arrow-up-right height="16px" width="16px" />
            </a>
          </p>
        </div>
      </div>
      <script async src="https://subscribe-forms.beehiiv.com/embed.js"></script>
      <div
        class="embed-wrapper"
        wwwSquircle="16"
        [wwwSquircleBorderWidth]="2"
        wwwSquircleBorderColor="rgba(0,0,0,0.12)"
      >
        <script
          async
          src="https://subscribe-forms.beehiiv.com/embed.js"
        ></script>
        <iframe
          src="https://subscribe-forms.beehiiv.com/72f18478-8f18-4324-ae1f-084d71f0c093"
          class="beehiiv-embed"
          data-test-id="beehiiv-embed"
          frameborder="0"
          scrolling="no"
          style="width: 400px; height: 40px; margin: 0; border-radius: 0px 0px 0px 0px !important; background-color: transparent; box-shadow: 0 0 #0000; max-width: 100%;"
        ></iframe>
      </div>
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
      gap: 24px;
      padding: 64px 16px;
      width: 100%;
      max-width: 800px;

      > .title {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;

        > img {
          width: auto;
          height: 128px;
          flex-shrink: 0;
          aspect-ratio: 83/100;
        }

        > div {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;

          > h2 {
            color: var(--grey-dark, #414042);
            text-align: center;
            font:
              500 16px/24px Fredoka,
              sans-serif;
          }

          > p {
            text-align: center;
            font:
              300 12px/16px Fredoka,
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

      .embed-wrapper {
        display: flex;
        padding: 8px;
        background-color: white;

        > iframe {
          width: 100%;
          background: transparent;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 64px 32px;
        gap: 64px;

        > .title {
          gap: 48px;

          > img {
            width: 144px;
          }

          > div {
            > h2 {
              font:
                500 24px/32px Fredoka,
                sans-serif;
            }

            > p {
              font:
                300 16px/24px Fredoka,
                sans-serif;
            }
          }
        }
      }
    }
  `,
})
export class TheGravy {
  private sanitizer = inject(DomSanitizer);

  id = input<string>('56612be1-e6e1-4363-ba58-bae94bb9bd47');

  sanitizedUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://subscribe-forms.beehiiv.com/${this.id()}`,
    ),
  );
}
