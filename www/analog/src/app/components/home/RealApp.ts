import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { INVOICING_LINKS } from './home.content';

@Component({
  selector: 'www-real-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="copy">
        <h2>See it in a real app</h2>
        <p>
          An invoicing assistant that answers with the app's own tables and
          charts. The data is simulated.
        </p>
        <div class="built">
          <div class="tile">
            <strong>hashbrown</strong><span>Chat and generative UI</span>
          </div>
          <a class="tile" [href]="links.b4" target="_blank" rel="noopener">
            <strong>b4.run ↗</strong><span>Agent backend</span>
          </a>
          <a
            class="tile"
            [href]="links.pretable"
            target="_blank"
            rel="noopener"
          >
            <strong>pretable.ai ↗</strong><span>Data grid</span>
          </a>
        </div>
        <div class="actions">
          <a
            class="hb-btn primary"
            [href]="links.app"
            target="_blank"
            rel="noopener"
            (click)="analytics.track('invoicing-demo-clicked')"
            >Try the app ↗</a
          >
          <a class="hb-btn" [href]="links.source" target="_blank" rel="noopener"
            >Read the source</a
          >
        </div>
      </div>
      <a
        class="shot"
        [href]="links.app"
        target="_blank"
        rel="noopener"
        (click)="analytics.track('invoicing-demo-clicked')"
      >
        <picture>
          <source
            media="(max-width: 767px)"
            srcset="/image/landing-page/invoicing-mobile.webp"
            width="585"
            height="1100"
          />
          <img
            src="/image/landing-page/invoicing.webp"
            alt="The invoicing example answering which USD customers are more than 60 days overdue with a ledger table, an aging chart, and a customer card"
            loading="lazy"
            width="1400"
            height="1200"
          />
        </picture>
      </a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
      align-items: center;
      padding: 28px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 24px;
      background: #fff;
    }

    h2 {
      font: 800 36px/1.1 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    p {
      margin-top: 12px;
      font:
        400 16px/1.55 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .built {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      margin: 22px 0;
    }

    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px;
      border-radius: 14px;
      background: var(--vanilla-ivory);
      color: inherit;
      text-decoration: none;
    }

    .tile strong {
      font: 700 17px/1.3 var(--font-heading);
      color: var(--gray-dark);
    }

    .tile span {
      font:
        400 13.5px/1.4 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .shot img {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 16px;
    }

    @media screen and (min-width: 1024px) {
      .card {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        gap: 36px;
        padding: 36px;
      }

      .built {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class RealApp {
  readonly analytics = inject(AnalyticsService);
  readonly links = INVOICING_LINKS;
}
