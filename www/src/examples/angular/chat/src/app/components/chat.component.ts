import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { ComposerComponent } from './composer.component';

@Component({
  selector: 'app-chat',
  imports: [ComposerComponent],
  template: `
    <div class="messages">
      @for (message of chat.value(); track $index) {
        @switch (message.role) {
          @case ('user') {
            <div class="user">
              <p>{{ message.content }}</p>
            </div>
          }
          @case ('assistant') {
            <div class="assistant">
              <p>{{ message.content }}</p>
            </div>
          }
        }
      }
    </div>
    <app-composer (sendMessage)="sendMessage($event)" placeholder="Hello!" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      height: 100%;
      overflow-y: auto;
    }

    .messages {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .user,
    .assistant {
      padding: 16px;
      border-radius: 16px;
      width: 80%;
    }

    .user {
      background-color: rgba(61, 60, 58, 0.24);
      align-self: flex-end;
      margin-bottom: 16px;
    }

    .assistant {
      background-color: #fff;
    }
  `,
})
export class ChatComponent {
  chat = chatResource({
    model: 'gpt-4.1',
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
