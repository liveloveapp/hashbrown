import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-quick-intro-video',
  imports: [RouterLink],
  template: `
    <div style="padding:56.25% 0 0 0;position:relative" class="video">
      <iframe
        src="https://player.vimeo.com/video/1090554554?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
        frameborder="0"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
        style="position:absolute;top:0;left:0;width:100%;height:100%;"
        title="hashbrown - 5 quick things"
      ></iframe>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #fbbb52;
    }

    .video {
      width: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 34px;

      > .video {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 96px 64px;
      }
    }
  `,
})
export class QuickIntroVideo {}
