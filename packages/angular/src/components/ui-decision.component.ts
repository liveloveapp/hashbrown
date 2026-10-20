import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type UiDecisionResourceCandidatesRef } from '../resources/ui-decision-resource.fn';

/**
 * Renders the chosen candidates of a candidates-mode `uiDecisionResource`
 * in order, binding each candidate's latest `inputs` (signal inputs update
 * in place).
 *
 * Chat mode needs no component: the chat renders its own messages.
 *
 * @public
 * @example
 *
 * ```html
 * <hb-ui-decision [resource]="cards" />
 * ```
 */
@Component({
  selector: 'hb-ui-decision',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @for (candidate of resource().chosen(); track candidate.id) {
      <ng-container
        *ngComponentOutlet="candidate.component; inputs: candidate.inputs"
      />
    }
  `,
})
export class UiDecisionComponent {
  /** The candidates-mode resource whose chosen candidates to render. */
  readonly resource = input.required<UiDecisionResourceCandidatesRef>();
}
