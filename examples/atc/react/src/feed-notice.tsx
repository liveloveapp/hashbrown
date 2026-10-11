import { feedNotice } from '@atc/shared';
import { useAtcState } from './store';

/**
 * A quiet line saying the feed is connecting or delayed; nothing while it is
 * live. It is a status region only while it has something to say.
 */
export function FeedNotice() {
  const notice = feedNotice(useAtcState().feedStatus);

  return notice === null ? null : (
    <span className="atc-feed-notice" role="status">
      <span className="atc-feed-notice-dot" aria-hidden="true" />
      {notice}
    </span>
  );
}
