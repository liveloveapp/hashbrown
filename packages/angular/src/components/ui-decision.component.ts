import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { type UiDecisionResourceRef } from '../resources/ui-decision-resource.fn';
import { RenderMessageComponent } from './render-message.component';

/**
 * Renders the result of `uiDecisionResource`.
 *
 * In candidates mode it renders the chosen candidates in order, binding each
 * candidate's `inputs`. In narrowing mode it renders the UI completion's
 * message with `hb-render-message`.
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
  imports: [NgComponentOutlet, RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (resource().mode === 'narrowing') {
      <hb-render-message [message]="message()" />
    } @else {
      @for (candidate of chosen(); track candidate.id) {
        <ng-container
          *ngComponentOutlet="candidate.component; inputs: candidate.inputs"
        />
      }
    }
  `,
})
export class UiDecisionComponent {
  /** The resource whose decision to render. */
  readonly resource = input.required<UiDecisionResourceRef>();

  /**
   * @internal
   */
  protected readonly chosen = computed(() => {
    const resource = this.resource();
    return resource.mode === 'candidates' ? resource.chosen() : [];
  });

  /**
   * @internal
   */
  protected readonly message = computed(() => {
    const resource = this.resource();
    return resource.mode === 'narrowing' ? resource.value() : null;
  });
}
