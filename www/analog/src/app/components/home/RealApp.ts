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
          An invoicing assistant that reads the ledger, explains balances, and
          renders tables and charts from your components. Data is simulated.
        </p>
        <div class="built">
          <div class="tile">
            <small>Generative UI</small><strong>hashbrown</strong
            ><span>Chat, tools, streamed components</span>
          </div>
          <a class="tile" [href]="links.b4" target="_blank" rel="noopener">
            <small>Agent backend</small><strong>b4.run ↗</strong
            ><span>TypeScript agents on LangGraph.js</span>
          </a>
          <a
            class="tile"
            [href]="links.pretable"
            target="_blank"
            rel="noopener"
          >
            <small>Data grid</small><strong>pretable.ai ↗</strong
            ><span>Fast React grid for streaming data</span>
          </a>
        </div>
        <div class="actions">
          <a
            class="btn primary"
            [href]="links.app"
            target="_blank"
            rel="noopener"
            (click)="analytics.track('invoicing-demo-clicked')"
            >Try the app ↗</a
          >
          <a class="btn" [href]="links.source" target="_blank" rel="noopener"
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
        <img
          src="/image/landing-page/invoicing.jpg"
          alt="The Hashbrown invoicing example: an invoice grid next to an AI assistant chat"
          loading="lazy"
          width="1400"
          height="875"
        />
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

    .tile small {
      font:
        600 10.5px/1.2 'Fredoka',
        sans-serif;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--sunset-orange);
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

    .btn {
      display: inline-flex;
      padding: 11px 18px;
      border: 1.5px solid var(--chocolate-brown);
      border-radius: 12px;
      background: #fff;
      color: var(--chocolate-brown);
      font:
        600 15px/1 'Fredoka',
        sans-serif;
      text-decoration: none;
    }

    .btn.primary {
      background: var(--chocolate-brown);
      color: #fff;
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
