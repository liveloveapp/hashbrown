import { Component, input } from '@angular/core';
import { RenderMessageComponent, UiChat } from '@hashbrownai/angular';
import { Chat } from '@hashbrownai/core';

@Component({
  selector: 'www-messages',
  imports: [RenderMessageComponent],
  template: `
    @for (message of messages(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message user">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          <hb-render-message [message]="message" />
        }
      }
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .chat-message.user {
        padding: 16px;
        border-radius: 16px;
        width: 80%;
        background-color: rgba(61, 60, 58, 0.24);
        align-self: flex-end;
        margin-bottom: 16px;
      }

      .chat-message.assistant {
        align-self: flex-start;
        width: 100%;
      }

      .chat-message.component {
        align-self: flex-start;
        width: 100%;
      }

      .chat-message.tool {
        align-self: flex-start;
        width: 100%;
        font-style: italic;
      }

      hb-render-message {
        gap: 16px;
      }
    `,
  ],
})
export class Messages {
  messages = input.required<UiChat.Message[]>();
}
