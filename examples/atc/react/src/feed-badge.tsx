import { feedBadgeView } from '@atc/shared';
import { useAtcState } from './store';

/** Shows how fresh the data is and offers replay when the feed stalls. */
export function FeedBadge() {
  const view = feedBadgeView(useAtcState().feedStatus);

  return (
    <span className="atc-badge" role="status">
      {view.label}
      {view.offerReplay ? (
        <button
          type="button"
          onClick={() => (window.location.search = '?replay=1')}
        >
          Switch to replay
        </button>
      ) : null}
    </span>
  );
}
