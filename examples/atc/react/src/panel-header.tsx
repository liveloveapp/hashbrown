import { ATC_SOURCE_URL, GITHUB_MARK_PATH } from '@atc/shared';
import { AtcLogo } from './atc-logo';
import { FeedNotice } from './feed-notice';

/**
 * The chat panel's header: lettermark, Hashbrown credit, a quiet notice
 * while the feed is degraded, and the GitHub link to atc's source.
 */
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
      <FeedNotice />
      <a
        className="atc-source-link"
        href={ATC_SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="atc source on GitHub"
      >
        <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d={GITHUB_MARK_PATH} />
        </svg>
      </a>
    </div>
  );
}
