import { flightCardView } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { useEffect } from 'react';
import { useAtcState, useAtcStore } from '../store';
import { CardSkeleton } from './card-skeleton';

/** Props the model provides. `hex` arrives whole; `note` streams. */
export interface FlightCardProps {
  readonly note: string;
  readonly hex: string;
}

/**
 * One aircraft. Reads live data from the store, so it keeps updating after
 * the answer ends. Its header shows the plane on the map.
 */
export function FlightCard({ note, hex }: FlightCardProps) {
  const store = useAtcStore();
  const view = flightCardView(useAtcState(), hex);
  useEffect(() => store.pulse(hex), [store, hex]);

  if (view.status === 'unknown') {
    return (
      <article
        className="atc-card"
        data-testid="flight-card"
        data-hex={view.hex}
        data-status="unknown"
      >
        <p className="atc-card-title">Unknown aircraft</p>
        <p className="atc-card-note">{note}</p>
      </article>
    );
  }

  return (
    <article
      className="atc-card"
      data-testid="flight-card"
      data-hex={view.hex}
      data-status={view.status}
    >
      <header>
        <button
          type="button"
          className={`atc-pick${view.selected ? ' is-selected' : ''}`}
          disabled={view.status !== 'live'}
          onClick={() => store.revealAircraft(view.hex)}
        >
          <strong className="atc-callsign">{view.label}</strong>
          {view.subtitle ? (
            <span className="atc-card-muted">{view.subtitle}</span>
          ) : null}
        </button>
      </header>
      <p className="atc-card-muted">
        {view.aircraftType}
        {view.route ? ` · ${view.route}` : null}
      </p>
      <dl>
        <div>
          <dt>Altitude</dt>
          <dd data-testid="flight-altitude">{view.altitude}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{view.speed}</dd>
        </div>
        <div>
          <dt>Heading</dt>
          <dd>{view.heading}</dd>
        </div>
      </dl>
      {view.lastSeen ? (
        <p className="atc-card-muted">
          Out of range · last seen {view.lastSeen}
        </p>
      ) : null}
      <p className="atc-card-note">{note}</p>
    </article>
  );
}

/** Shown until the full aircraft ID has arrived. */
export function FlightCardFallback({ partialProps }: ComponentFallbackProps) {
  const note = partialProps?.['note'];

  return (
    <article className="atc-card" data-testid="flight-card-fallback">
      <CardSkeleton />
      {typeof note === 'string' && note ? (
        <p className="atc-card-note">{note}</p>
      ) : null}
    </article>
  );
}
