import { type AirportCode, arrivalsRows } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState } from '../store';

/** Props the model provides. Rows stream in; each ID arrives whole. */
export interface ArrivalsBoardProps {
  readonly title: string;
  readonly airport: AirportCode;
  readonly hexes: string[];
}

/** A live table of aircraft approaching an airport. */
export function ArrivalsBoard({ title, airport, hexes }: ArrivalsBoardProps) {
  const rows = arrivalsRows(useAtcState(), airport, hexes);

  return (
    <section className="atc-card" data-testid="arrivals-board">
      <h3>{title}</h3>
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
          {rows.map((row) => (
            <tr key={row.hex} data-testid="arrivals-row" data-hex={row.hex} data-status={row.status}>
              <td>{row.callsign}</td>
              <td>{row.aircraftType}</td>
              <td>{row.altitude}</td>
              <td>{row.distance}</td>
              <td>{row.eta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Shown until the airport is known. */
export function ArrivalsBoardFallback({ partialProps }: ComponentFallbackProps) {
  const title = partialProps?.['title'];

  return (
    <section className="atc-card" data-testid="arrivals-board-fallback">
      <h3>{typeof title === 'string' ? title : ''}</h3>
      <div className="atc-skeleton" />
    </section>
  );
}
