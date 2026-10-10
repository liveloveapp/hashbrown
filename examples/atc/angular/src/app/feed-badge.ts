import { feedBadgeView } from '@atc/shared';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAtcState } from './store';

/** Shows how fresh the aircraft data is. */
@Component({
  selector: 'atc-feed-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="atc-badge" role="status">{{ view().label }}</span>`,
})
export class FeedBadgeComponent {
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    feedBadgeView(this.state().feedStatus),
  );
}
