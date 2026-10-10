import { type AirportCode, arrivalsRows } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { injectAtcState } from '../store';

/** A live table of aircraft approaching an airport. */
@Component({
  selector: 'atc-arrivals-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="arrivals-board">
      <h3>{{ title() }}</h3>
      <table>
        <thead>
          <tr>
            <th>Flight</th>
            <th>Type</th>
            <th>Altitude</th>
            <th>Distance</th>
            <th>ETA</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.hex) {
            <tr
              data-testid="arrivals-row"
              [attr.data-hex]="row.hex"
              [attr.data-status]="row.status"
            >
              <td>{{ row.callsign }}</td>
              <td>{{ row.aircraftType }}</td>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="arrivals-board-fallback">
      <h3>{{ title() }}</h3>
      <div class="atc-skeleton"></div>
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
