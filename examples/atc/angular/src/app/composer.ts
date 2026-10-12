import { isFocusShortcut } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * The message pill, floating over the bottom of the transcript. `/` focuses
 * the pill from anywhere outside another field. The field is uncontrolled
 * (read on submit)
 * because nothing else needs the draft; React's composer keeps it in state,
 * the idiomatic choice there.
 */
@Component({
  selector: 'atc-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'atc-composer',
    '(document:keydown)': 'focusOnSlash($event)',
  },
  template: `
    <form
      class="atc-composer-pill"
      (submit)="$event.preventDefault(); submit()"
    >
      <input
        #field
        aria-label="Message"
        placeholder="Ask about the planes"
        autocomplete="off"
      />
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
  /** Emits the trimmed message text. */
  readonly send = output<string>();
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected submit(): void {
    const field = this.field().nativeElement;
    const content = field.value.trim();
    // Focus first: a tap on Send moved focus to the button, and taking it
    // back opens a phone's sheet, so sending must come after to lower it.
    field.focus();
    if (content) {
      this.send.emit(content);
      field.value = '';
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
