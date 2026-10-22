import { ATC_SOURCE_URL, GITHUB_MARK_PATH } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { AtcLogo } from './atc-logo';
import { FeedNotice } from './feed-notice';
import { DevIcon } from './rail';

/**
 * The chat panel's header: lettermark, Hashbrown credit, a quiet notice
 * while the feed is degraded, the GitHub link to atc's source and, on phones
 * (where there is no rail), the developer tools toggle.
 */
@Component({
  selector: 'atc-panel-header',
  imports: [AtcLogo, DevIcon, FeedNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-panel-header' },
  template: `
    <atc-logo [height]="15" />
    <a
      class="atc-credit"
      href="https://hashbrown.dev"
      target="_blank"
      rel="noreferrer"
      ><span class="atc-credit-lead">built with </span>Hashbrown</a
    >
    <atc-feed-notice />
    <button
      type="button"
      class="atc-header-dev"
      aria-label="Developer tools"
      data-testid="dev-toggle-header"
      [attr.aria-pressed]="devMode()"
      (click)="toggleDevMode.emit()"
    >
      <atc-dev-icon />
    </button>
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
  /** Whether dev mode is on, for the phone toggle's pressed state. */
  readonly devMode = input(false);
  /** Emits when the phone toggle is pressed. */
  readonly toggleDevMode = output();
  protected readonly sourceUrl = ATC_SOURCE_URL;
  protected readonly githubMark = GITHUB_MARK_PATH;
}
