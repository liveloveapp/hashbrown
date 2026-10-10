import { feedBadgeView } from '@atc/shared';
import { useAtcState } from './store';

/** Shows how fresh the aircraft data is. */
export function FeedBadge() {
  const view = feedBadgeView(useAtcState().feedStatus);

  return (
    <span className="atc-badge" role="status">
      {view.label}
    </span>
  );
}
