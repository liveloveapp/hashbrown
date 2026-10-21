import { type Starter, starterPrompts } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  output,
} from '@angular/core';
import { injectAtcState } from './store';

let nextId = 0;

/**
 * What the chat shows before the first message: a question and starter
 * pills in two groups, "Filter the map" first and then "Ask a question",
 * which leads with "What's the plane I selected?" while a plane is selected.
 * `pick` emits the starter with its route: starters skip the router.
 */
@Component({
  selector: 'atc-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-empty' },
  template: `
    <p class="atc-empty-title">
      Ask about the planes over the Pacific Northwest.
    </p>
    @for (group of groups(); track group.label) {
      <div
        class="atc-starter-group"
        role="group"
        [attr.aria-labelledby]="group.id"
      >
        <h2 [id]="group.id" class="atc-starter-heading">{{ group.label }}</h2>
        <div class="atc-starters">
          @for (starter of group.starters; track starter.text) {
            <button type="button" (click)="pick.emit(starter)">
              {{ starter.text }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class EmptyState {
  /** Emits the starter the user picked, with its route. */
  readonly pick = output<Starter>();
  private readonly uid = `atc-starters-${nextId++}`;
  private readonly state = injectAtcState();
  protected readonly groups = computed(() => {
    const starters = starterPrompts(this.state().selectedHex !== null);

    return [
      {
        id: `${this.uid}-filter`,
        label: 'Filter the map',
        starters: starters.filter((starter) => starter.route === 'filter'),
      },
      {
        id: `${this.uid}-question`,
        label: 'Ask a question',
        starters: starters.filter((starter) => starter.route !== 'filter'),
      },
    ];
  });
}
