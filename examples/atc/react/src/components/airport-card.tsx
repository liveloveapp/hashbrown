import { airportCardView, partialText } from '@atc/shared';
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { Fragment } from 'react';
import { useAtcState, useAtcStore } from '../store';
import { CardSkeleton } from './card-skeleton';

/** Props the model provides. `airport` arrives whole; `note` streams. */
export interface AirportCardProps {
  readonly note: string;
  readonly airport: string;
}

/**
 * One airport. Reads the chart data from the store. Its header shows the
 * airport on the map.
 */
export function AirportCard({ note, airport }: AirportCardProps) {
  const store = useAtcStore();
  const view = airportCardView(useAtcState(), airport);

  if (view.status === 'unknown') {
    return (
      <article
        className="atc-card atc-airport-card"
        data-testid="airport-card"
        data-airport={view.code}
        data-status="unknown"
      >
        <p className="atc-card-title">Unknown airport</p>
        <p className="atc-card-note">{note}</p>
      </article>
    );
  }

  return (
    <article
      className="atc-card atc-airport-card"
      data-testid="airport-card"
      data-airport={view.code}
      data-status={view.status}
    >
      <button
        type="button"
        className="atc-pick atc-card-head"
        onClick={() => store.showAirport(view.code)}
      >
        <span className="atc-card-title">{view.title}</span>
        {view.badge ? (
          <span className="atc-airport-badge">{view.badge}</span>
        ) : null}
      </button>
      <p className="atc-card-note">{note}</p>
      <dl className="atc-airport-freqs atc-mono">
        {view.frequencies.map((freq) => (
          <Fragment key={freq.label}>
            <dt>{freq.label}</dt>
            <dd>{freq.value}</dd>
          </Fragment>
        ))}
      </dl>
      {view.elevation ? (
        <p className="atc-airport-elev atc-mono">Elevation {view.elevation}</p>
      ) : null}
      {view.airspace ? (
        <p className="atc-airport-airspace atc-mono">
          Airspace: {view.airspace}
        </p>
      ) : null}
      <ul className="atc-airport-runways atc-mono">
        {view.runways.map((runway) => (
          <li key={runway}>{runway}</li>
        ))}
      </ul>
    </article>
  );
}

/** Shown until the full airport code has arrived. */
export function AirportCardFallback({ partialProps }: ComponentFallbackProps) {
  const note = partialText(partialProps, 'note');

  return (
    <article className="atc-card" data-testid="airport-card-fallback">
      <CardSkeleton label="Identifying airport…" />
      {note ? <p className="atc-card-note">{note}</p> : null}
    </article>
  );
}
