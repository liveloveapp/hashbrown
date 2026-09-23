import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { THREADPLANE_URL } from './home.content';

@Component({
  selector: 'www-threadplane-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="banner"
      [href]="url"
      target="_blank"
      rel="noopener"
      (click)="analytics.track('threadplane-banner-clicked')"
    >
      <div class="text">
        <div class="big">Your chat UI<br /><em>isn't done.</em></div>
        <p>
          threadplane is the full agent UI for React and Angular: threads,
          approvals, and tool progress. Free and MIT, with enterprise support
          from the team behind Hashbrown.
        </p>
        <span class="cta">Explore threadplane →</span>
      </div>
      <img
        src="/image/landing-page/threadplane/brian-skeptical.webp"
        alt="Brian Love"
        loading="lazy"
        width="840"
        height="900"
      />
    </a>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .banner {
      position: relative;
      display: block;
      min-height: 380px;
      overflow: hidden;
      border-radius: 24px;
      background: radial-gradient(
        120% 140% at 82% 18%,
        #22385c 0%,
        #15253e 45%,
        #0c1626 100%
      );
      color: #fff;
      text-decoration: none;
    }

    .text {
      position: relative;
      z-index: 1;
      max-width: 620px;
      padding: 36px 24px 240px;
    }

    .big {
      font: 900 40px/0.98 var(--font-heading);
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }

    .big em {
      font-style: normal;
      color: #ff6b4a;
    }

    p {
      max-width: 500px;
      margin: 20px 0 26px;
      font: 600 17px/1.5 var(--font-heading);
      opacity: 0.88;
    }

    .cta {
      display: inline-block;
      padding: 13px 20px;
      border-radius: 10px;
      background: #ffaf00;
      color: #0a0a0a;
      font: 700 16px/1 var(--font-heading);
    }

    img {
      position: absolute;
      right: 0;
      bottom: 0;
      width: auto;
      height: 240px;
    }

    @media screen and (min-width: 1024px) {
      .text {
        padding: 56px 0 56px 56px;
      }

      .big {
        font-size: 64px;
      }

      img {
        height: 100%;
        max-height: 420px;
      }
    }
  `,
})
export class ThreadplaneBanner {
  readonly analytics = inject(AnalyticsService);
  readonly url = THREADPLANE_URL;
}
