import { Component, input, Type } from '@angular/core';
import { AssistantMessageComponent, ChatMessage } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat-messages',
  standalone: true,
  imports: [AssistantMessageComponent],
  template: `
    @for (message of messages(); track $index) { @switch (message.role) { @case
    ('user') {
    <div class="chat-message user">
      <p>{{ message.content }}</p>
    </div>
    } @case ('assistant') {
    <div class="chat-message assistant">
      <lib-assistant-message
        [message]="message"
        [components]="components()"
      ></lib-assistant-message>
    </div>
    } } }
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

      lib-assistant-message {
        width: 100%;
      }
    `,
  ],
})
export class MessagesComponent {
  components = input.required<{
    [componentName: string]: Type<any>;
  }>();
  messages = input.required<ChatMessage[]>();
}
