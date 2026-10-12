import { airportCardView, partialText } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { ATC_STORE, injectAtcState } from '../store';
import { CardSkeleton } from './card-skeleton';

/**
 * One airport. Reads the chart data from the store. Its header shows the
 * airport on the map.
 */
@Component({
  selector: 'atc-airport-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let card = view();
    @if (card.status === 'unknown') {
      <article
        class="atc-card atc-airport-card"
        data-testid="airport-card"
        [attr.data-airport]="card.code"
        data-status="unknown"
      >
        <p class="atc-card-title">Unknown airport</p>
        <p class="atc-card-note">{{ note() }}</p>
      </article>
    } @else {
      <article
        class="atc-card atc-airport-card"
        data-testid="airport-card"
        [attr.data-airport]="card.code"
        [attr.data-status]="card.status"
      >
        <button
          type="button"
          class="atc-pick atc-card-head"
          (click)="store.showAirport(card.code)"
        >
          <span class="atc-card-title">{{ card.title }}</span>
          @if (card.badge) {
            <span class="atc-airport-badge">{{ card.badge }}</span>
          }
        </button>
        <p class="atc-card-note">{{ note() }}</p>
        <dl class="atc-airport-freqs atc-mono">
          @for (freq of card.frequencies; track freq.label) {
            <dt>{{ freq.label }}</dt>
            <dd>{{ freq.value }}</dd>
          }
        </dl>
        @if (card.elevation) {
          <p class="atc-airport-elev atc-mono">
            Elevation {{ card.elevation }}
          </p>
        }
        @if (card.airspace) {
          <p class="atc-airport-airspace atc-mono">
            Airspace: {{ card.airspace }}
          </p>
        }
        <ul class="atc-airport-runways atc-mono">
          @for (runway of card.runways; track runway) {
            <li>{{ runway }}</li>
          }
        </ul>
      </article>
    }
  `,
})
export class AirportCard {
  readonly note = input.required<string>();
  readonly airport = input.required<string>();
  protected readonly store = inject(ATC_STORE);
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    airportCardView(this.state(), this.airport()),
  );
}

/** Shown until the full airport code has arrived. */
@Component({
  selector: 'atc-airport-card-fallback',
  imports: [CardSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="atc-card" data-testid="airport-card-fallback">
      <atc-card-skeleton label="Identifying airport…" />
      @if (note()) {
        <p class="atc-card-note">{{ note() }}</p>
      }
    </article>
  `,
})
export class AirportCardFallback {
  readonly partialProps = input<Record<string, JsonResolvedValue>>({});
  protected readonly note = computed(() =>
    partialText(this.partialProps(), 'note'),
  );
}
