import { labelForHex, type ToolCallLike, toolRunView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { injectAtcState } from './store';

/**
 * One assistant turn's tool calls. Finished calls fold into one summary line
 * ("Searched traffic, looked up 6 routes") that expands to every step; a
 * running call shows live with a spinner, such as "Finding aircraft ·
 * approaching KSEA". A call only spins while the chat is busy, so it always
 * settles.
 */
@Component({
  selector: 'atc-tool-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-tool-run' },
  template: `
    @let run = view();
    @if (run.summary) {
      <button
        type="button"
        class="atc-tool-summary"
        data-testid="tool-summary"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        <span class="atc-tool-dot" aria-hidden="true"></span>
        <span class="atc-tool-summary-text">{{ run.summary }}</span>
        <svg
          class="atc-tool-chevron"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5l3-3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    }
    @if (open()) {
      <ol class="atc-tool-steps">
        @for (chip of run.chips; track $index) {
          <li
            class="atc-tool-chip"
            data-testid="tool-step"
            [attr.data-state]="chip.state"
          >
            {{ chip.label }}
            @if (chip.state === 'failed') {
              <span class="atc-tool-note">· failed</span>
            }
            @if (chip.state === 'stopped') {
              <span class="atc-tool-note">· stopped</span>
            }
          </li>
        }
      </ol>
    }
    @for (chip of run.live; track $index) {
      <span class="atc-tool-chip" data-testid="tool-chip" data-state="running">
        <span class="atc-tool-spinner" aria-hidden="true"></span>
        {{ chip.label }}
      </span>
    }
  `,
})
export class ToolChips {
  /** The assistant message's tool calls, in the order the model made them. */
  readonly calls = input.required<readonly ToolCallLike[]>();
  /** Whether the chat is still running. */
  readonly busy = input(false);
  /** Whether the summary is expanded to every step. */
  protected readonly open = signal(false);
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    toolRunView(this.calls(), this.busy(), labelForHex(this.state())),
  );
}
