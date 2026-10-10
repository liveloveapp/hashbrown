import { flightCardView, plainLabel } from '@atc/shared';
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

/** Two or three aircraft side by side, live; each shows its plane on the map. */
@Component({
  selector: 'atc-aircraft-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="aircraft-compare">
      <div class="atc-compare">
        @for (card of cards(); track $index) {
          @if (card.status === 'unknown') {
            <div class="atc-compare-item">
              <p class="atc-card-muted">Unknown aircraft</p>
            </div>
          } @else {
            <button
              type="button"
              class="atc-compare-item atc-pick"
              [class.is-selected]="card.selected"
              [attr.data-hex]="card.hex"
              [disabled]="card.status !== 'live'"
              (click)="store.revealAircraft(card.hex)"
            >
              <strong class="atc-callsign">{{ card.label }}</strong>
              <span class="atc-card-muted">{{ card.aircraftType }}</span>
              <span class="atc-figure">{{ card.altitude }}</span>
              <span class="atc-figure">{{ card.speed }}</span>
            </button>
          }
        }
      </div>
      <p class="atc-card-note">{{ note() }}</p>
    </section>
  `,
})
export class AircraftCompare {
  readonly takeaway = input.required<string>();
  readonly hexes = input.required<string[]>();
  protected readonly store = inject(ATC_STORE);
  private readonly state = injectAtcState();
  protected readonly note = computed(() => plainLabel(this.takeaway()));
  protected readonly cards = computed(() =>
    this.hexes().map((hex) => flightCardView(this.state(), hex)),
  );
}

/** Shown until every aircraft ID has arrived. */
@Component({
  selector: 'atc-aircraft-compare-fallback',
  imports: [CardSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="aircraft-compare-fallback">
      <atc-card-skeleton />
      @if (takeaway()) {
        <p class="atc-card-note">{{ takeaway() }}</p>
      }
    </section>
  `,
})
export class AircraftCompareFallback {
  readonly partialProps = input<Record<string, JsonResolvedValue>>({});
  protected readonly takeaway = computed(() => {
    const takeaway = this.partialProps()['takeaway'];

    return typeof takeaway === 'string' ? plainLabel(takeaway) : '';
  });
}
