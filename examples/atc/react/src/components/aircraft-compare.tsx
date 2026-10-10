import { flightCardView, plainLabel } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useAtcState, useAtcStore } from '../store';
import { CardSkeleton } from './card-skeleton';

/** Props the model provides. `hexes` arrives whole; `takeaway` streams. */
export interface AircraftCompareProps {
  readonly takeaway: string;
  readonly hexes: string[];
}

/** Two or three aircraft side by side, live; each shows its plane on the map. */
export function AircraftCompare({ takeaway, hexes }: AircraftCompareProps) {
  const store = useAtcStore();
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
            <button
              key={`${index}-${hex}`}
              type="button"
              className={`atc-compare-item atc-pick${view.selected ? ' is-selected' : ''}`}
              data-hex={view.hex}
              disabled={view.status !== 'live'}
              onClick={() => store.revealAircraft(view.hex)}
            >
              <strong className="atc-callsign">{view.label}</strong>
              <span className="atc-card-muted">{view.aircraftType}</span>
              <span className="atc-figure">{view.altitude}</span>
              <span className="atc-figure">{view.speed}</span>
            </button>
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
