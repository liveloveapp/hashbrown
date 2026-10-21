import { isFocusShortcut, type RouterShown } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { injectRouter } from './router';

/**
 * The one input, a pill floating over the bottom of the transcript. As you
 * type, a badge shows where Enter will send the text (`→ filter 0.97`): the
 * map filter (`filter`), clearing it (`clear`), or the chat (`chat`). `/`
 * focuses the pill from anywhere outside another field.
 */
@Component({
  selector: 'atc-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'atc-composer',
    '(document:keydown)': 'focusOnSlash($event)',
  },
  template: `
    <form class="atc-composer-pill" (submit)="submit($event)">
      <input
        #field
        aria-label="Message"
        placeholder="Ask about the planes"
        autocomplete="off"
        aria-describedby="atc-route-badge"
        (input)="typed(field.value)"
      />
      <span
        id="atc-route-badge"
        class="atc-route"
        [attr.data-tone]="router.badge().tone"
        >{{ router.badge().label }}</span
      >
      <kbd class="atc-kbd" aria-hidden="true">/</kbd>
      <button
        type="submit"
        class="atc-send"
        aria-label="Send"
        [disabled]="busy()"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </form>
  `,
})
export class Composer {
  /** Disables sending while the assistant is answering. */
  readonly busy = input(false);
  /** Emits the trimmed text routed to the chat. */
  readonly chat = output<string>();
  /** Emits the trimmed text routed to the map filter. */
  readonly filter = output<string>();
  /**
   * Emits what the router decided, just before `chat` or `filter` emits the
   * text it was for (for "Show the stream").
   */
  readonly routed = output<RouterShown>();
  /** Emits when the text asks to clear the map filter. */
  readonly clear = output();
  private readonly draft = signal('');
  protected readonly router = injectRouter(this.draft);
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected typed(value: string): void {
    this.router.cancel();
    this.draft.set(value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const field = this.field().nativeElement;
    const content = field.value.trim();
    // Focus first: a tap on Send moved focus to the button, and taking it
    // back opens a phone's sheet, so sending must come after to lower it.
    field.focus();
    if (!content) {
      return;
    }
    const action = await this.router.submit();
    if (action === null) {
      return;
    }
    // Read before clearing the draft, which resets the router's state.
    const routed = this.router.shown();
    field.value = '';
    this.draft.set('');
    if (action.kind === 'filter') {
      this.routed.emit(routed);
      this.filter.emit(content);
    } else if (action.kind === 'clear') {
      this.clear.emit();
    } else {
      this.routed.emit(routed);
      this.chat.emit(content);
    }
  }

  protected focusOnSlash(event: KeyboardEvent): void {
    if (!isFocusShortcut(event)) {
      return;
    }
    event.preventDefault();
    this.field().nativeElement.focus();
  }
}
