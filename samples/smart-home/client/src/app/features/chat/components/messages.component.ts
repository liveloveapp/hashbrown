import { Component, input } from '@angular/core';
import { RenderMessageComponent, RichChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat-messages',
  standalone: true,
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
        padding: 16px;
      }

      .chat-message.user {
        padding: 16px;
        border-radius: 16px;
        width: 80%;
        background-color: var(--mat-sys-surface-container-highest);
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
    `,
  ],
})
export class MessagesComponent {
  messages = input.required<RichChat.Message[]>();
}
