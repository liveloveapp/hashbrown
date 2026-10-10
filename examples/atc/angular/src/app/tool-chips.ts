import { labelForHex, type ToolCallLike, toolRunView } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { injectAtcState } from './store';

let nextId = 0;

/**
 * One assistant turn's tool activity, as one quiet line. While a step runs,
 * the line says what it is doing ("Finding aircraft approaching Seattle…")
 * with a spinner and a shimmer, in a polite live region. Once the steps
 * finish it becomes a button with a check, what they did and how many there
 * were ("Searched traffic · 2 steps"), which expands to every step. A call
 * only runs while the chat is busy, so the line always settles.
 */
@Component({
  selector: 'atc-tool-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-tool-run' },
  template: `
    @let run = view();
    @if (run.current) {
      <p class="atc-activity" data-testid="tool-current" aria-live="polite">
        <span class="atc-tool-spinner" aria-hidden="true"></span>
        <span class="atc-activity-text atc-shimmer">{{ run.current }}</span>
      </p>
    } @else if (run.summary) {
      <button
        type="button"
        class="atc-activity atc-activity-toggle"
        data-testid="tool-summary"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="stepsId"
        (click)="open.set(!open())"
      >
        <svg
          class="atc-activity-icon"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path
            d="M2.5 6.2 5 8.5l4.5-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="atc-activity-text">{{ run.summary }}</span>
        <span class="atc-activity-count">{{ ' · ' + run.steps }}</span>
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
    @if (open() && !run.current) {
      <ol class="atc-tool-steps" [id]="stepsId">
        @for (chip of run.chips; track $index) {
          <li
            class="atc-tool-step"
            data-testid="tool-step"
            [attr.data-state]="chip.state"
          >
            {{ chip.label }}
            @if (chip.state === 'failed' || chip.state === 'stopped') {
              <span>({{ chip.state }})</span>
            }
          </li>
        }
      </ol>
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
  protected readonly stepsId = `atc-tool-steps-${nextId++}`;
  private readonly state = injectAtcState();
  protected readonly view = computed(() =>
    toolRunView(this.calls(), this.busy(), labelForHex(this.state())),
  );
}
