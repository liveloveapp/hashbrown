import { CdkTextareaAutosize, TextFieldModule } from '@angular/cdk/text-field';
import { Component, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Squircle } from '../squircle';

@Component({
  selector: 'app-chat-composer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, TextFieldModule, Squircle],
  template: `
    <div
      class="container"
      appSquircle="12"
      [appSquircleBorderWidth]="2"
      appSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
    >
      <div class="textareaWrapper">
        <textarea
          name="Message"
          #textarea
          matInput
          cdkTextareaAutosize
          cdkAutosizeMinRows="1"
          cdkAutosizeMaxRows="5"
          class="chat-composer"
          placeholder="Ask"
          id="chat-input"
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
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 16px;
      }

      .container {
        position: relative;
        background: #fff;
      }

      .textareaWrapper {
        padding: 16px 48px 16px 16px;
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
