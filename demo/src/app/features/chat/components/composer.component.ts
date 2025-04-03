import { Component, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-chat-composer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <textarea
      class="chat-composer"
      placeholder="Message..."
      (keydown.enter)="onHitEnter(textarea, $event)"
      #textarea
    ></textarea>
    <button
      mat-icon-button
      class="send-button"
      aria-label="Send"
      (click)="onSendMessage(textarea)"
    >
      <mat-icon>send</mat-icon>
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
        border: none;
        border-radius: 24px;
        background-color: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface);
      }

      .send-button {
        position: absolute;
        right: 8px;
        top: 4px;
      }
    `,
  ],
})
export class ComposerComponent {
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
