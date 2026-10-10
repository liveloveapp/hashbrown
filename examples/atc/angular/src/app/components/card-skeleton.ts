import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The quiet hold-back line shown while a card's aircraft IDs stream in. */
@Component({
  selector: 'atc-card-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-card-skeleton' },
  template: `
    <p class="atc-card-muted">Identifying aircraft…</p>
    <div class="atc-skeleton-bar" aria-hidden="true"></div>
    <div class="atc-skeleton-bar is-short" aria-hidden="true"></div>
  `,
})
export class CardSkeletonComponent {}
