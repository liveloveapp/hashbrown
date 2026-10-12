import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The quiet hold-back line shown while a card's ID streams in. */
@Component({
  selector: 'atc-card-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-card-skeleton' },
  template: `
    <p class="atc-card-muted">{{ label() }}</p>
    <div class="atc-skeleton-bar" aria-hidden="true"></div>
    <div class="atc-skeleton-bar is-short" aria-hidden="true"></div>
  `,
})
export class CardSkeleton {
  readonly label = input('Identifying aircraft…');
}
