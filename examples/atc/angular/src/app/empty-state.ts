import { type Starter, starterPrompts } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  output,
} from '@angular/core';
import { injectAtcState } from './store';

/**
 * What the chat shows before the first message: a question and starter
 * pills, led by "What's the plane I selected?" while a plane is selected.
 * Each pill is tagged as a question (chat) or a filter (map), and `pick`
 * emits the starter with its route: starters skip the router.
 */
@Component({
  selector: 'atc-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-empty' },
  template: `
    <p class="atc-empty-title">
      Ask about the planes over the Pacific Northwest.
    </p>
    <div class="atc-starters">
      @for (starter of starters(); track starter.text) {
        <button type="button" (click)="pick.emit(starter)">
          {{ starter.text }}
          <span class="atc-starter-hint"
            >({{ starter.route === 'filter' ? 'filter' : 'question' }})</span
          >
          <span class="atc-starter-kind" aria-hidden="true">{{
            starter.route === 'filter' ? 'filter' : 'question'
          }}</span>
        </button>
      }
    </div>
  `,
})
export class EmptyState {
  /** Emits the starter the user picked, with its route. */
  readonly pick = output<Starter>();
  private readonly state = injectAtcState();
  protected readonly starters = computed(() =>
    starterPrompts(this.state().selectedHex !== null),
  );
}
