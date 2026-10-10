import {
  type AirportCode,
  arrivalsRows,
  boardShowsEta,
  plainLabel,
} from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState, useAtcStore } from '../store';
import { CardSkeleton } from './card-skeleton';

/** Props the model provides. Rows stream in; each ID arrives whole. */
export interface ArrivalsBoardProps {
  readonly title: string;
  readonly airport: AirportCode;
  readonly hexes: string[];
}

/**
 * A live table of aircraft approaching or near an airport. The type sits
 * under each label; units are in the headers. The ETA column shows only when
 * one of them is approaching. Picking a live row shows that plane on the map.
 */
export function ArrivalsBoard({ title, airport, hexes }: ArrivalsBoardProps) {
  const store = useAtcStore();
  const state = useAtcState();
  const rows = arrivalsRows(state, airport, hexes);
  const showEta = boardShowsEta(state, airport, hexes);

  return (
    <section className="atc-card" data-testid="arrivals-board">
      <h3 className="atc-card-title">{plainLabel(title)}</h3>
      <table className="atc-board">
        <thead>
          <tr>
            <th scope="col">Flight</th>
            <th scope="col">Alt (ft)</th>
            <th scope="col">Dist (nm)</th>
            {showEta ? <th scope="col">ETA (min)</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${index}-${row.hex}`}
              data-testid="arrivals-row"
              data-hex={row.hex}
              data-status={row.status}
              className={
                [
                  row.selectable ? 'is-selectable' : '',
                  row.selected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              // The row's button bubbles here; clicks elsewhere in it count too.
              onClick={() => {
                if (row.selectable) store.revealAircraft(row.hex);
              }}
            >
              <td className="atc-board-flight">
                {row.selectable ? (
                  <button type="button" className="atc-pick">
                    <span className="atc-callsign">{row.label}</span>{' '}
                    <span className="atc-board-type">{row.aircraftType}</span>
                  </button>
                ) : (
                  <>
                    <span className="atc-callsign">{row.label}</span>{' '}
                    <span className="atc-board-type">
                      {row.aircraftType}
                      {row.status === 'out-of-range' ? ' · out of range' : null}
                    </span>
                  </>
                )}
              </td>
              <td>{row.altitude}</td>
              <td>{row.distance}</td>
              {showEta ? <td>{row.eta}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Shown until the airport is known. */
export function ArrivalsBoardFallback({
  partialProps,
}: ComponentFallbackProps) {
  const title = partialProps?.['title'];

  return (
    <section className="atc-card" data-testid="arrivals-board-fallback">
      {typeof title === 'string' && title ? (
        <h3 className="atc-card-title">{plainLabel(title)}</h3>
      ) : null}
      <CardSkeleton />
    </section>
  );
}
