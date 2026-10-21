import {
  answerBlocks,
  answerTurns,
  chatStatus,
  labelForHex,
  thinkingStatus,
  type TranscriptItem,
  type TurnShown,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  RenderMessageComponent,
  type UiChatMessage,
} from '@hashbrownai/angular';
import { ShowStream } from './show-stream';
import { injectAtcState } from './store';
import { StreamPanel } from './stream-panel';
import { ToolChips } from './tool-chips';

/**
 * The conversation: user bubbles, the model's reasoning summaries, tool
 * activity lines and rendered answers, plus a shimmering "Thinking…" line while
 * the assistant works with nothing else on screen saying so. The list is a
 * polite live region that is busy while the answer streams, so screen readers
 * announce each new row once instead of every token. Since nothing inside a
 * busy region is announced, a visually hidden status region beside it says what
 * the assistant is doing now (the running step, "Reasoning…" while a reasoning
 * summary streams, else "Thinking…"); it stays mounted, so each change is
 * announced. With "Show the stream" on, each send's last answer carries a
 * panel with the decisions (`turns`, one per user row) and the streaming JSON.
 */
@Component({
  selector: 'atc-transcript',
  imports: [RenderMessageComponent, StreamPanel, ToolChips],
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
          @case ('reasoning') {
            <li class="atc-reasoning" data-testid="reasoning">
              @if (item.done) {
                <details>
                  <summary class="atc-activity atc-activity-toggle">
                    Reasoned
                  </summary>
                  <p class="atc-reasoning-text">{{ item.text }}</p>
                </details>
              } @else {
                <span class="atc-activity">
                  <span class="atc-activity-text atc-shimmer">Reasoning</span>
                </span>
                <p class="atc-reasoning-text">{{ item.text }}</p>
              }
            </li>
          }
          @case ('tools') {
            <li><atc-tool-chips [calls]="item.calls" [busy]="busy()" /></li>
          }
          @case ('answer') {
            <li class="atc-answer">
              <hb-render-message [message]="item.message" />
              @if (panels()[$index]; as blocks) {
                <atc-stream-panel label="Answer stream" [blocks]="blocks" />
              }
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
  /** What each send recorded for its answer's panel, one per user row. */
  readonly turns = input<readonly TurnShown[]>([]);
  private readonly showStream = inject(ShowStream);
  private readonly state = injectAtcState();
  protected readonly thinking = computed(() =>
    thinkingStatus(this.items(), this.busy()),
  );
  protected readonly status = computed(() =>
    chatStatus(this.items(), this.busy(), labelForHex(this.state())),
  );
  /** The panel blocks under each row, null where there is no panel. */
  protected readonly panels = computed(() => {
    const items = this.items();
    const answers = answerTurns(items);

    return items.map((item, index) => {
      const turn = answers[index];
      if (!this.showStream.on() || item.kind !== 'answer' || turn === null) {
        return null;
      }

      return answerBlocks(
        this.turns()[turn],
        item.message.content,
        this.busy() && index === items.length - 1,
      );
    });
  });
}
