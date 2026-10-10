import { feedNotice } from '@atc/shared';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAtcState } from './store';

/**
 * A quiet line saying the feed is connecting or delayed; nothing while it is
 * live. It is a status region only while it has something to say.
 */
@Component({
  selector: 'atc-feed-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (notice(); as text) {
      <span class="atc-feed-notice" role="status">
        <span class="atc-feed-notice-dot" aria-hidden="true"></span>
        {{ text }}
      </span>
    }
  `,
})
export class FeedNotice {
  private readonly state = injectAtcState();
  protected readonly notice = computed(() =>
    feedNotice(this.state().feedStatus),
  );
}
