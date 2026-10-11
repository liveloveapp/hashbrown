import { ATC_SOURCE_URL, GITHUB_MARK_PATH } from '@atc/shared';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AtcLogo } from './atc-logo';
import { FeedNotice } from './feed-notice';

/**
 * The chat panel's header: lettermark, Hashbrown credit, a quiet notice
 * while the feed is degraded, and the GitHub link to atc's source.
 */
@Component({
  selector: 'atc-panel-header',
  imports: [AtcLogo, FeedNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-panel-header' },
  template: `
    <atc-logo [height]="15" />
    <a
      class="atc-credit"
      href="https://hashbrown.dev"
      target="_blank"
      rel="noreferrer"
      >built with Hashbrown</a
    >
    <atc-feed-notice />
    <a
      class="atc-source-link"
      [href]="sourceUrl"
      target="_blank"
      rel="noreferrer"
      aria-label="atc source on GitHub"
    >
      <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" [attr.d]="githubMark" />
      </svg>
    </a>
  `,
})
export class PanelHeader {
  protected readonly sourceUrl = ATC_SOURCE_URL;
  protected readonly githubMark = GITHUB_MARK_PATH;
}
