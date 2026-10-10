import { feedBadgeView } from '@atc/shared';
import { useAtcState } from './store';

/** Shows how fresh the aircraft data is. */
export function FeedBadge() {
  const state = useAtcState();
  const view = feedBadgeView(state.feedStatus, state.aircraft.size);

  return (
    <span className="atc-badge" role="status">
      {view.label}
    </span>
  );
}
