import { starterPrompts } from '@atc/shared';
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
      @for (prompt of starters(); track prompt) {
        <button type="button" (click)="pick.emit(prompt)">{{ prompt }}</button>
      }
    </div>
  `,
})
export class EmptyState {
  /** Emits the starter prompt the user picked. */
  readonly pick = output<string>();
  private readonly state = injectAtcState();
  protected readonly starters = computed(() =>
    starterPrompts(this.state().selectedHex !== null),
  );
}
