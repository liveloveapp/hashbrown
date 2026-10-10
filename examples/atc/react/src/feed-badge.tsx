import { feedBadgeView } from '@atc/shared';
import { useAtcState } from './store';

/** The header status chip: how fresh the aircraft data is. */
export function FeedBadge() {
  const state = useAtcState();
  const view = feedBadgeView(state.feedStatus, state.aircraft.size);

  return (
    <span className="atc-chip" role="status">
      {view.live ? <span className="atc-chip-dot" aria-hidden="true" /> : null}
      {view.label}
    </span>
  );
}
