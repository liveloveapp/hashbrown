import { ATC_SOURCE_URL, GITHUB_MARK_PATH } from '@atc/shared';
import { AtcLogo } from './atc-logo';
import { FeedNotice } from './feed-notice';
import { DevIcon } from './rail';

/**
 * The chat panel's header: lettermark, Hashbrown credit, a quiet notice
 * while the feed is degraded, the GitHub link to atc's source and, on phones
 * (where there is no rail), the developer tools toggle.
 */
export function PanelHeader({
  devMode = false,
  onToggleDevMode,
}: {
  devMode?: boolean;
  onToggleDevMode?: () => void;
}) {
  return (
    <div className="atc-panel-header">
      <AtcLogo height={15} />
      <a
        className="atc-credit"
        href="https://hashbrown.dev"
        target="_blank"
        rel="noreferrer"
      >
        <span className="atc-credit-lead">built with </span>
        Hashbrown
      </a>
      <FeedNotice />
      {onToggleDevMode ? (
        <button
          type="button"
          className="atc-header-dev"
          aria-label="Developer tools"
          aria-pressed={devMode}
          data-testid="dev-toggle-header"
          onClick={onToggleDevMode}
        >
          <DevIcon />
        </button>
      ) : null}
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
