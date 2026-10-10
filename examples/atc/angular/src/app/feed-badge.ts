import { feedBadgeView } from '@atc/shared';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAtcState } from './store';

/** The header status chip: how fresh the aircraft data is. */
@Component({
  selector: 'atc-feed-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Only the state word is a live region; the count changes every poll and
  // would be announced constantly.
  template: `<span class="atc-chip">
    @if (view().live) {
      <span class="atc-chip-dot" aria-hidden="true"></span>
    }
    <span role="status">{{ view().label }}</span>
    @if (view().count; as count) {
      <span> · {{ count }}</span>
    }
  </span>`,
})
export class FeedBadgeComponent {
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    feedBadgeView(this.state().feedStatus, this.state().aircraft.size),
  );
}
