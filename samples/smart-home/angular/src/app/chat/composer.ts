import { Component, output, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CdkTextareaAutosize, TextFieldModule } from '@angular/cdk/text-field';

@Component({
  selector: 'app-chat-composer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, TextFieldModule],
  template: `
    <div class="textareaWrapper">
      <textarea
        name="Message"
        #textarea
        matInput
        cdkTextareaAutosize
        cdkAutosizeMinRows="1"
        cdkAutosizeMaxRows="5"
        class="chat-composer"
        placeholder="Message..."
        (keydown.enter)="onHitEnter(textarea, $event)"
      ></textarea>
    </div>
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

      .textareaWrapper {
        padding: 16px 48px 16px 16px;
        border-radius: 24px;
        background-color: var(--mat-sys-surface-container-high);
      }

      textarea {
        width: 100%;
        border: none;
        color: var(--mat-sys-on-surface);
        background: none;
        outline: none;
        overflow: none;
        padding: 0;
        margin: 0;
      }

      .send-button {
        position: absolute;
        right: 8px;
        top: 4px;
        color: #774625;
      }
    `,
  ],
})
export class Composer {
  sendMessage = output<string>();

  autosize = viewChild.required(CdkTextareaAutosize);

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
    this.autosize().reset();
  }
}
