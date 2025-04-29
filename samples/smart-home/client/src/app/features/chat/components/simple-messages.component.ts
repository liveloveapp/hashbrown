import { Component, input } from '@angular/core';
import { Chat } from '@hashbrownai/core';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-simple-chat-messages',
  standalone: true,
  imports: [MarkdownComponent],
  template: `
    @for (message of messages(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message user">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          <markdown [data]="message.content" />
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
export class SimpleMessagesComponent {
  messages = input.required<Chat.Message[]>();
}
