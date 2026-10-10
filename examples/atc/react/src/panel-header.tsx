import { AtcLogo } from './atc-logo';
import { FeedBadge } from './feed-badge';

/** The chat panel's header: lettermark, Hashbrown credit and status chip. */
export function PanelHeader() {
  return (
    <div className="atc-panel-header">
      <span className="atc-logo">
        <AtcLogo height={15} />
      </span>
      <a
        className="atc-credit"
        href="https://hashbrown.dev"
        target="_blank"
        rel="noreferrer"
      >
        built with Hashbrown
      </a>
      <span className="atc-panel-header-status">
        <FeedBadge />
      </span>
    </div>
  );
}
