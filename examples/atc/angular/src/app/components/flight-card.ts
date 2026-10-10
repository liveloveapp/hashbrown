import { flightCardView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { ATC_STORE, injectAtcState } from '../store';

/** One aircraft. Reads live data from the store, so it keeps updating after the answer ends. */
@Component({
  selector: 'atc-flight-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let card = view();
    @if (card.status === 'unknown') {
      <article
        class="atc-card"
        data-testid="flight-card"
        [attr.data-hex]="card.hex"
        data-status="unknown"
      >
        <p>Unknown aircraft</p>
        <p class="atc-card-note">{{ note() }}</p>
      </article>
    } @else {
      <article
        class="atc-card"
        data-testid="flight-card"
        [attr.data-hex]="card.hex"
        [attr.data-status]="card.status"
      >
        <header>
          <strong>{{ card.callsign }}</strong>
          <span>{{ card.airline }}</span>
        </header>
        <p class="atc-card-type">{{ card.aircraftType }}</p>
        @if (card.route) {
          <p class="atc-card-route">{{ card.route }}</p>
        }
        <dl>
          <div>
            <dt>Altitude</dt>
            <dd data-testid="flight-altitude">{{ card.altitude }}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{{ card.speed }}</dd>
          </div>
          <div>
            <dt>Heading</dt>
            <dd>{{ card.heading }}</dd>
          </div>
        </dl>
        @if (card.lastSeen) {
          <p class="atc-card-status">
            Out of range · last seen {{ card.lastSeen }}
          </p>
        }
        <p class="atc-card-note">{{ note() }}</p>
      </article>
    }
  `,
})
export class FlightCardComponent implements OnInit {
  readonly note = input.required<string>();
  readonly hex = input.required<string>();
  private readonly store = inject(ATC_STORE);
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    flightCardView(this.state(), this.hex()),
  );

  ngOnInit(): void {
    this.store.pulse(this.hex());
  }
}

/** Shown until the full aircraft ID has arrived. */
@Component({
  selector: 'atc-flight-card-fallback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="atc-card" data-testid="flight-card-fallback">
      <div class="atc-skeleton" aria-label="Identifying aircraft"></div>
      <p class="atc-card-note">{{ note() }}</p>
    </article>
  `,
})
export class FlightCardFallbackComponent {
  readonly partialProps = input<Record<string, JsonResolvedValue>>({});
  protected readonly note = computed(() => {
    const note = this.partialProps()['note'];

    return typeof note === 'string' ? note : '';
  });
}
