import { flightCardView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { injectAtcState } from '../store';
import { CardSkeletonComponent } from './card-skeleton';

/** Two or three aircraft side by side, live. */
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
            <div class="atc-compare-item" [attr.data-hex]="card.hex">
              <strong class="atc-callsign">{{ card.callsign }}</strong>
              <p class="atc-card-muted">{{ card.aircraftType }}</p>
              <p class="atc-figure">{{ card.altitude }}</p>
              <p class="atc-figure">{{ card.speed }}</p>
            </div>
          }
        }
      </div>
      <p class="atc-card-note">{{ takeaway() }}</p>
    </section>
  `,
})
export class AircraftCompareComponent {
  readonly takeaway = input.required<string>();
  readonly hexes = input.required<string[]>();
  private readonly state = injectAtcState();
  protected readonly cards = computed(() =>
    this.hexes().map((hex) => flightCardView(this.state(), hex)),
  );
}

/** Shown until every aircraft ID has arrived. */
@Component({
  selector: 'atc-aircraft-compare-fallback',
  imports: [CardSkeletonComponent],
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
export class AircraftCompareFallbackComponent {
  readonly partialProps = input<Record<string, JsonResolvedValue>>({});
  protected readonly takeaway = computed(() => {
    const takeaway = this.partialProps()['takeaway'];

    return typeof takeaway === 'string' ? takeaway : '';
  });
}
