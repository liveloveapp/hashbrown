import { feedBadgeView } from '@atc/shared';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAtcState } from './store';

/** The header status chip: how fresh the aircraft data is. */
@Component({
  selector: 'atc-feed-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="atc-chip" role="status">
    @if (view().live) {
      <span class="atc-chip-dot" aria-hidden="true"></span>
    }
    {{ view().label }}
  </span>`,
})
export class FeedBadgeComponent {
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    feedBadgeView(this.state().feedStatus, this.state().aircraft.size),
  );
}
