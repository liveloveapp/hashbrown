import { feedBadgeView } from '@atc/shared';
import { useAtcState } from './store';

/** The header status chip: how fresh the aircraft data is. */
export function FeedBadge() {
  const state = useAtcState();
  const view = feedBadgeView(state.feedStatus, state.aircraft.size);

  return (
    <span className="atc-chip">
      {view.live ? <span className="atc-chip-dot" aria-hidden="true" /> : null}
      {/* Only the state word is live; the count changes every poll. */}
      <span role="status">{view.label}</span>
      {view.count ? (
        <span>
          {' · '}
          {view.count}
        </span>
      ) : null}
    </span>
  );
}
