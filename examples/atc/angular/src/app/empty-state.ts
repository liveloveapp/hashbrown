import { SOURCE_URLS, STARTER_PROMPTS } from '@atc/shared';
import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/** What the chat shows before the first message: a question and starter pills. */
@Component({
  selector: 'atc-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-empty' },
  template: `
    <p class="atc-empty-title">
      Ask about the planes over the Pacific Northwest.
    </p>
    <div class="atc-starters">
      @for (prompt of starters; track prompt) {
        <button type="button" (click)="pick.emit(prompt)">{{ prompt }}</button>
      }
    </div>
    <a class="atc-source" [href]="sourceUrl" target="_blank" rel="noreferrer"
      >View the core file</a
    >
  `,
})
export class EmptyStateComponent {
  /** Emits the starter prompt the user picked. */
  readonly pick = output<string>();
  protected readonly starters = STARTER_PROMPTS;
  protected readonly sourceUrl = SOURCE_URLS.angular;
}
