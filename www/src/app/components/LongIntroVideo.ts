import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-long-intro-video',
  imports: [RouterLink],
  template: `
    <div class="bleed">
      <div class="container">
        <h2>demo of hashbrown</h2>
        <p>
          See a full demo of our sample Angular application using hashbrown,
          streaming responses and UI generation, function calling, structured
          data, and even
          <strong
            >executing LLM generated code in our QuickJS JavaScript
            runtime</strong
          >.
        </p>
        <div class="video">
          <div style="padding:64.9% 0 0 0;position:relative;" class="video">
            <iframe
              src="https://player.vimeo.com/video/1088958585?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              style="position:absolute;top:0;left:0;width:100%;height:100%;"
              title="Introducing Hashbrown"
            ></iframe>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      padding: 32px 32px;
      width: 100%;
      max-width: 1024px;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 34px;

      > h2 {
        color: #5e5c5a;
        font:
          600 36px/48px 'Fredoka',
          sans-serif;
      }

      > p {
        max-width: 767px;
        width: 100%;
        text-align: center;
        font:
          400 18px/24px Poppins,
          sans-serif;

        > strong {
          font-weight: 600;
        }
      }

      > .video {
        width: 100%;
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 96px 64px;
      }
    }
  `,
})
export class LongIntroVideo {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
}
