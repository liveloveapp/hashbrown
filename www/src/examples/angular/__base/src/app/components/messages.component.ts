import { Component, input } from '@angular/core';
import { RenderMessageComponent, UiChatMessage } from '@hashbrownai/angular';

@Component({
  selector: 'app-messages',
  imports: [RenderMessageComponent],
  template: `
    @for (message of messages(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          @if (message.content) {
            <hb-render-message [message]="message" />
          }
        }
      }
    }
  `,
  styles: [
    `
      :host {
        flex: 1 auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow: auto;
      }

      .chat-message {
        padding: 16px;
        border-radius: 16px;
        width: 80%;
        background-color: rgba(61, 60, 58, 0.24);
        align-self: flex-end;
        margin-bottom: 16px;
      }
    `,
  ],
})
export class MessagesComponent {
  messages = input.required<UiChatMessage<any>[]>();
}
