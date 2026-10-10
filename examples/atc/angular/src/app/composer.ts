import { SOURCE_URLS } from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Whether a key event started somewhere the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null;
}

/**
 * The message pill and the core-file footnote. `/` focuses the pill from
 * anywhere outside another field.
 */
@Component({
  selector: 'atc-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'focusOnSlash($event)' },
  template: `
    <form class="atc-composer-pill" (submit)="submit(); (false)">
      <input
        #field
        aria-label="Message"
        placeholder="Ask about the planes on the map"
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
    <a class="atc-footnote" [href]="sourceUrl" target="_blank" rel="noreferrer"
      >View the core file</a
    >
  `,
})
export class ComposerComponent {
  /** Disables sending while the assistant is answering. */
  readonly busy = input(false);
  /** Emits the trimmed message text. */
  readonly send = output<string>();
  protected readonly sourceUrl = SOURCE_URLS.angular;
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected submit(): void {
    const field = this.field().nativeElement;
    const content = field.value.trim();
    if (content) {
      this.send.emit(content);
      field.value = '';
    }
    field.focus();
  }

  protected focusOnSlash(event: KeyboardEvent): void {
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (
      event.key !== '/' ||
      modified ||
      event.defaultPrevented ||
      isTyping(event.target)
    ) {
      return;
    }
    event.preventDefault();
    this.field().nativeElement.focus();
  }
}
