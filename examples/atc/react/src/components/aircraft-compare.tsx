import { flightCardView } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState } from '../store';

/** Props the model provides. `hexes` arrives whole; `takeaway` streams. */
export interface AircraftCompareProps {
  readonly takeaway: string;
  readonly hexes: string[];
}

/** Two or three aircraft side by side, live. */
export function AircraftCompare({ takeaway, hexes }: AircraftCompareProps) {
  const state = useAtcState();

  return (
    <section className="atc-card" data-testid="aircraft-compare">
      <div className="atc-compare">
        {hexes.map((hex) => {
          const view = flightCardView(state, hex);

          return view.status === 'unknown' ? (
            <div key={hex}>Unknown aircraft</div>
          ) : (
            <div key={hex} data-hex={view.hex}>
              <strong>{view.callsign}</strong>
              <p className="atc-card-type">{view.aircraftType}</p>
              <p>{view.altitude}</p>
              <p>{view.speed}</p>
            </div>
          );
        })}
      </div>
      <p className="atc-card-note">{takeaway}</p>
    </section>
  );
}

/** Shown until every aircraft ID has arrived. */
export function AircraftCompareFallback({ partialProps }: ComponentFallbackProps) {
  const takeaway = partialProps?.['takeaway'];

  return (
    <section className="atc-card" data-testid="aircraft-compare-fallback">
      <div className="atc-skeleton" aria-label="Identifying aircraft" />
      <p className="atc-card-note">{typeof takeaway === 'string' ? takeaway : ''}</p>
    </section>
  );
}
