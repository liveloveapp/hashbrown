import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Presents validated streaming plan fields, with an optional application-owned footer. */
@Component({
  selector: 'app-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article class="wb-summary" aria-label="Summary card">
    <span class="wb-muted">SummaryCard · trusted component</span>
    <h2>{{ title() || 'Building your plan…' }}</h2>
    <ol>
      @for (step of steps(); track $index) {
        <li>{{ step }}</li>
      }
    </ol>
    <ng-content />
  </article>`,
})
export class PlanCard {
  readonly title = input.required<string>();
  readonly steps = input.required<string[]>();
}
