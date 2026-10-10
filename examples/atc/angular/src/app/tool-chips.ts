import { type ToolCallLike, toolChipView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * One chip per tool call, e.g. `findAircraft · approaching KSEA`. A chip only
 * spins while its call is pending and the chat is busy, so it always settles.
 */
@Component({
  selector: 'atc-tool-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-tool-chips' },
  template: `
    @for (chip of chips(); track $index) {
      <span
        class="atc-tool-chip"
        data-testid="tool-chip"
        [attr.data-state]="chip.state"
      >
        @if (chip.state === 'running') {
          <span class="atc-tool-spinner" aria-hidden="true"></span>
        } @else {
          <span class="atc-tool-dot" aria-hidden="true"></span>
        }
        {{ chip.label }}
        @if (chip.state === 'failed') {
          <span class="atc-tool-note">· failed</span>
        }
      </span>
    }
  `,
})
export class ToolChipsComponent {
  /** The assistant message's tool calls, in the order the model made them. */
  readonly calls = input.required<readonly ToolCallLike[]>();
  /** Whether the chat is still running. */
  readonly busy = input(false);
  protected readonly chips = computed(() =>
    this.calls().map((call) => toolChipView(call, this.busy())),
  );
}
