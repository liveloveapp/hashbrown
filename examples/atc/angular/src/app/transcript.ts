import { type TranscriptItem } from '@atc/shared';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  RenderMessageComponent,
  type UiChatMessage,
} from '@hashbrownai/angular';
import { ToolChipsComponent } from './tool-chips';

/**
 * The conversation: user bubbles, folded tool chip rows and rendered answers.
 * It is a polite live region that is busy while the answer streams, so screen
 * readers announce each new row once instead of every token.
 */
@Component({
  selector: 'atc-transcript',
  imports: [RenderMessageComponent, ToolChipsComponent],
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
    </ol>
  `,
})
export class TranscriptComponent {
  /** Rows from `transcriptItems`. */
  readonly items = input.required<readonly TranscriptItem<UiChatMessage>[]>();
  /** Whether the chat is still running. */
  readonly busy = input(false);
}
