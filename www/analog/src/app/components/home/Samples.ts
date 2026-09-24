import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Squircle } from '../Squircle';
import { ConfigService } from '../../services/ConfigService';
import { quickStartUrl } from './home.content';

@Component({
  selector: 'www-samples',
  imports: [RouterLink, Squircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section wwwSquircle="32" aria-labelledby="example-heading">
      <h2 id="example-heading">Invoicing with an AI assistant</h2>
      <p>
        Ask questions about a ledger, explore generated views, and review
        payment allocations before applying them. Built with React, Hashbrown,
        B4, and Pretable. All data is simulated.
      </p>
      <nav aria-label="Invoicing example">
        <a href="https://invoicing.hashbrown.dev">Try the invoicing app</a>
        <a
          href="https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing"
        >
          Read the source
        </a>
        <a [routerLink]="quickStartUrl()">Build your own</a>
      </nav>
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    section {
      max-width: 1072px;
      margin: 32px auto;
      padding: 48px 32px;
      background: var(--sunshine-yellow-light, #fde4ba);
      color: var(--gray-dark, #3d3c3a);
    }
    h2 {
      font:
        750 32px/1.2 KefirVariable,
        sans-serif;
      margin: 16px 0;
    }
    p {
      font:
        400 18px/1.6 Fredoka,
        sans-serif;
      max-width: 760px;
      margin: 16px 0;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      margin-top: 24px;
    }
    a {
      font:
        500 16px/1.5 Fredoka,
        sans-serif;
      text-decoration: underline;
    }
    @media (max-width: 768px) {
      section {
        margin: 16px;
        padding: 32px 24px;
      }
    }
  `,
})
/** Presents the maintained, simulated invoicing example. */
export class Samples {
  configService = inject(ConfigService);

  quickStartUrl = computed(() => quickStartUrl(this.configService.sdk()));
}
