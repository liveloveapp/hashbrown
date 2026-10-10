import { type AirportCode, arrivalsRows } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { injectAtcState } from '../store';
import { CardSkeletonComponent } from './card-skeleton';

/** A live table of aircraft approaching an airport. */
@Component({
  selector: 'atc-arrivals-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="arrivals-board">
      <h3 class="atc-card-title">{{ title() }}</h3>
      <table class="atc-board">
        <thead>
          <tr>
            <th scope="col">Flight</th>
            <th scope="col">Type</th>
            <th scope="col">Alt</th>
            <th scope="col">Dist</th>
            <th scope="col">ETA</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr
              data-testid="arrivals-row"
              [attr.data-hex]="row.hex"
              [attr.data-status]="row.status"
            >
              <td class="atc-callsign">{{ row.callsign }}</td>
              <td class="atc-board-type" [title]="row.aircraftType">
                {{ row.aircraftType }}
              </td>
              <td>{{ row.altitude }}</td>
              <td>{{ row.distance }}</td>
              <td>{{ row.eta }}</td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class ArrivalsBoardComponent {
  readonly title = input.required<string>();
  readonly airport = input.required<AirportCode>();
  readonly hexes = input.required<string[]>();
  private readonly state = injectAtcState();
  protected readonly rows = computed(() =>
    arrivalsRows(this.state(), this.airport(), this.hexes()),
  );
}

/** Shown until the airport is known. */
@Component({
  selector: 'atc-arrivals-board-fallback',
  imports: [CardSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="arrivals-board-fallback">
      @if (title()) {
        <h3 class="atc-card-title">{{ title() }}</h3>
      }
      <atc-card-skeleton />
    </section>
  `,
})
export class ArrivalsBoardFallbackComponent {
  readonly partialProps = input<Record<string, JsonResolvedValue>>({});
  protected readonly title = computed(() => {
    const title = this.partialProps()['title'];

    return typeof title === 'string' ? title : '';
  });
}
