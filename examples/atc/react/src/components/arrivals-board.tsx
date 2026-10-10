import { type AirportCode, arrivalsRows, plainLabel } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState } from '../store';
import { CardSkeleton } from './card-skeleton';

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
      <h3 className="atc-card-title">{plainLabel(title)}</h3>
      <table className="atc-board">
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
          {rows.map((row, index) => (
            <tr
              key={`${index}-${row.hex}`}
              data-testid="arrivals-row"
              data-hex={row.hex}
              data-status={row.status}
            >
              <td className="atc-callsign">{row.label}</td>
              <td className="atc-board-type" title={row.aircraftType}>
                {row.aircraftType}
              </td>
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
