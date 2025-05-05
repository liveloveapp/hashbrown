import { Component, output } from '@angular/core';
import { CircleArrowUp } from '../icons/CircleArrowUp';

@Component({
  selector: 'www-composer',
  imports: [CircleArrowUp],
  template: `
    <textarea
      class="chat-composer"
      placeholder="Show me all lights"
      (keydown.enter)="onHitEnter(textarea, $event)"
      #textarea
    ></textarea>
    <button
      class="send-button"
      aria-label="Send"
      (click)="onSendMessage(textarea)"
    >
      <www-circle-arrow-up />
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }

      textarea {
        width: 100%;
        height: 48px;
        padding: 16px;
        border-radius: 24px;
        border: 1px solid rgba(47, 47, 43, 0.88);
      }

      .send-button {
        position: absolute;
        right: 8px;
        top: 11px;
      }
    `,
  ],
})
export class Composer {
  sendMessage = output<string>();

  onHitEnter(textarea: HTMLTextAreaElement, $event: Event) {
    $event.preventDefault();

    if (($event as KeyboardEvent).shiftKey) {
      textarea.value += '\n';
    } else {
      this.onSendMessage(textarea);
    }
  }

  onSendMessage(textarea: HTMLTextAreaElement) {
    this.sendMessage.emit(textarea.value);

    textarea.value = '';
  }
}
