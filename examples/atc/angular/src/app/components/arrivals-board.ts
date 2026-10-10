import {
  type AirportCode,
  type ArrivalsRow,
  arrivalsRows,
  boardShowsEta,
  plainLabel,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { JsonResolvedValue } from '@hashbrownai/core';
import { ATC_STORE, injectAtcState } from '../store';
import { CardSkeletonComponent } from './card-skeleton';

/**
 * A live table of aircraft approaching or near an airport. The type sits
 * under each label; units are in the headers. The ETA column shows only when
 * one of them is approaching. Picking a live row shows that plane on the map.
 */
@Component({
  selector: 'atc-arrivals-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="atc-card" data-testid="arrivals-board">
      <h3 class="atc-card-title">{{ label() }}</h3>
      <table class="atc-board">
        <thead>
          <tr>
            <th scope="col">Flight</th>
            <th scope="col">Alt (ft)</th>
            <th scope="col">Dist (nm)</th>
            @if (showEta()) {
              <th scope="col">ETA (min)</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr
              data-testid="arrivals-row"
              [attr.data-hex]="row.hex"
              [attr.data-status]="row.status"
              [class.is-selectable]="row.selectable"
              [class.is-selected]="row.selected"
              (click)="pick(row)"
            >
              <td class="atc-board-flight">
                @if (row.selectable) {
                  <button type="button" class="atc-pick">
                    <span class="atc-callsign">{{ row.label }}</span
                    >&ngsp;
                    <span class="atc-board-type">{{ row.aircraftType }}</span>
                  </button>
                } @else {
                  <span class="atc-callsign">{{ row.label }}</span
                  >&ngsp;
                  <span class="atc-board-type">
                    {{ row.aircraftType }}
                    @if (row.status === 'out-of-range') {
                      · out of range
                    }
                  </span>
                }
              </td>
              <td>{{ row.altitude }}</td>
              <td>{{ row.distance }}</td>
              @if (showEta()) {
                <td>{{ row.eta }}</td>
              }
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
  private readonly store = inject(ATC_STORE);
  private readonly state = injectAtcState();
  protected readonly label = computed(() => plainLabel(this.title()));
  protected readonly rows = computed(() =>
    arrivalsRows(this.state(), this.airport(), this.hexes()),
  );
  protected readonly showEta = computed(() =>
    boardShowsEta(this.state(), this.airport(), this.hexes()),
  );

  /** Shows a live row's plane on the map (the row's button bubbles here). */
  protected pick(row: ArrivalsRow): void {
    if (row.selectable) {
      this.store.revealAircraft(row.hex);
    }
  }
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

    return typeof title === 'string' ? plainLabel(title) : '';
  });
}
