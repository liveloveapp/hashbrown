import { flightCardView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { injectAtcState } from '../store';

/** Two or three aircraft side by side, live. */
@Component({
  selector: 'atc-aircraft-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="aircraft-compare">
      <div class="atc-compare">
        @for (card of cards(); track $index) {
          @if (card.status === 'unknown') {
            <div>Unknown aircraft</div>
          } @else {
            <div [attr.data-hex]="card.hex">
              <strong>{{ card.callsign }}</strong>
              <p class="atc-card-type">{{ card.aircraftType }}</p>
              <p>{{ card.altitude }}</p>
              <p>{{ card.speed }}</p>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="aircraft-compare-fallback">
      <div class="atc-skeleton" aria-label="Identifying aircraft"></div>
      <p class="atc-card-note">{{ takeaway() }}</p>
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
