import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AtcLogoComponent } from './atc-logo';
import { FeedBadgeComponent } from './feed-badge';

/** The chat panel's header: lettermark, Hashbrown credit and status chip. */
@Component({
  selector: 'atc-panel-header',
  imports: [AtcLogoComponent, FeedBadgeComponent],
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
    <atc-feed-badge class="atc-panel-header-status" />
  `,
})
export class PanelHeaderComponent {}
