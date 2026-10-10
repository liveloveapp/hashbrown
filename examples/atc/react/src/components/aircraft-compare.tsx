import { flightCardView, plainLabel } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState } from '../store';
import { CardSkeleton } from './card-skeleton';

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
        {hexes.map((hex, index) => {
          const view = flightCardView(state, hex);

          return view.status === 'unknown' ? (
            <div key={`${index}-${hex}`} className="atc-compare-item">
              <p className="atc-card-muted">Unknown aircraft</p>
            </div>
          ) : (
            <div
              key={`${index}-${hex}`}
              className="atc-compare-item"
              data-hex={view.hex}
            >
              <strong className="atc-callsign">{view.label}</strong>
              <p className="atc-card-muted">{view.aircraftType}</p>
              <p className="atc-figure">{view.altitude}</p>
              <p className="atc-figure">{view.speed}</p>
            </div>
          );
        })}
      </div>
      <p className="atc-card-note">{plainLabel(takeaway)}</p>
    </section>
  );
}

/** Shown until every aircraft ID has arrived. */
export function AircraftCompareFallback({
  partialProps,
}: ComponentFallbackProps) {
  const takeaway = partialProps?.['takeaway'];

  return (
    <section className="atc-card" data-testid="aircraft-compare-fallback">
      <CardSkeleton />
      {typeof takeaway === 'string' && takeaway ? (
        <p className="atc-card-note">{plainLabel(takeaway)}</p>
      ) : null}
    </section>
  );
}
