import { SELECTED_PROMPT, type Starter, starterPrompts } from '@atc/shared';
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
 * which leads with "What's the plane I selected?" while a plane is selected
 * (marked `data-lead`, so the phone peek's single row shows it first).
 * `pick` emits the starter with its route: starters skip the router.
 */
@Component({
  selector: 'atc-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-empty' },
  template: `
    <p class="atc-empty-title">
      Filter the map or ask about the planes overhead.
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
            <button
              type="button"
              [attr.data-lead]="starter.text === selectedPrompt ? '' : null"
              (click)="pick.emit(starter)"
            >
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
  protected readonly selectedPrompt = SELECTED_PROMPT;
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
