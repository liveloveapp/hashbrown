import {
  chatStatus,
  labelForHex,
  thinkingStatus,
  type TranscriptItem,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  RenderMessageComponent,
  type UiChatMessage,
} from '@hashbrownai/angular';
import { injectAtcState } from './store';
import { ToolChips } from './tool-chips';

/**
 * The conversation: user bubbles, tool activity lines and rendered answers,
 * plus a shimmering "Thinking…" line while the assistant works with nothing
 * else on screen saying so. The list is a polite live region that is busy
 * while the answer streams, so screen readers announce each new row once
 * instead of every token. Since nothing inside a busy region is announced,
 * a visually hidden status region beside it says what the assistant is doing
 * now (the running step, else "Thinking…"); it stays mounted, so each change
 * is announced.
 */
@Component({
  selector: 'atc-transcript',
  imports: [RenderMessageComponent, ToolChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol
      class="atc-transcript"
      aria-live="polite"
      aria-relevant="additions"
      [attr.aria-busy]="busy()"
    >
      @for (item of items(); track $index) {
        @switch (item.kind) {
          @case ('user') {
            <li class="atc-user">{{ item.text }}</li>
          }
          @case ('tools') {
            <li><atc-tool-chips [calls]="item.calls" [busy]="busy()" /></li>
          }
          @case ('answer') {
            <li class="atc-answer">
              <hb-render-message [message]="item.message" />
            </li>
          }
        }
      }
      @if (thinking(); as status) {
        <li class="atc-activity" data-testid="thinking">
          <span class="atc-activity-text atc-shimmer">{{ status }}</span>
        </li>
      }
    </ol>
    <p
      class="atc-visually-hidden"
      role="status"
      aria-live="polite"
      data-testid="chat-status"
    >
      {{ status() }}
    </p>
  `,
})
export class Transcript {
  /** Rows from `transcriptItems`. */
  readonly items = input.required<readonly TranscriptItem<UiChatMessage>[]>();
  /** Whether the chat is still running. */
  readonly busy = input(false);
  private readonly state = injectAtcState();
  protected readonly thinking = computed(() =>
    thinkingStatus(this.items(), this.busy()),
  );
  protected readonly status = computed(() =>
    chatStatus(this.items(), this.busy(), labelForHex(this.state())),
  );
}
