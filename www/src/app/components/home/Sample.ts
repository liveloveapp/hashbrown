import { Component } from '@angular/core';
import { Squircle } from '../Squircle';
import { SampleIframeComponent } from '../sample/SampleIframe';

@Component({
  selector: 'www-sample',
  imports: [Squircle, SampleIframeComponent],
  template: `
    <div class="bleed">
      <div
        class="player"
        wwwSquircle="32"
        [wwwSquircleBorderWidth]="4"
        wwwSquircleBorderColor="var(--gray, #5e5c5a)"
      >
        <www-sample-iframe />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 48px;
      padding: 16px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;

      > .header {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > p {
          color: var(--gray-dark, #3d3c3a);
          font:
            400 15px/24px Fredoka,
            sans-serif;
        }

        > h2 {
          color: rgba(0, 0, 0, 0.56);
          font:
            750 32px/40px KefirVariable,
            sans-serif;
          font-variation-settings: 'wght' 750;
        }
      }

      > .player {
        display: flex;
        height: 860px;
        width: 100%;
        overflow: hidden;

        > iframe {
          width: 100%;
          height: 100%;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 64px;
      }
    }
  `,
})
export class Sample {}
