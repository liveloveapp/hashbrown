import { feedBadgeView } from '@atc/shared';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAtcState } from './store';

/** Shows how fresh the data is and offers replay when the feed stalls. */
@Component({
  selector: 'atc-feed-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="atc-badge" role="status">
      {{ view().label }}
      @if (view().offerReplay) {
        <button type="button" (click)="switchToReplay()">
          Switch to replay
        </button>
      }
    </span>
  `,
})
export class FeedBadgeComponent {
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    feedBadgeView(this.state().feedStatus),
  );

  protected switchToReplay(): void {
    window.location.search = '?replay=1';
  }
}
