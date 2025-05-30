import { Component, inject } from '@angular/core';
import {
  chatResource,
  createTool,
  createToolWithArgs,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { AuthService } from '../services/auth.service';
import { LightsStore } from '../store/lights.store';
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
    <app-composer (sendMessage)="sendMessage($event)" placeholder="Who am I?" />
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
  lightsStore = inject(LightsStore);

  chat = chatResource({
    model: 'gpt-4.1',
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const authService = inject(AuthService);
          return authService.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) =>
          this.lightsStore.updateLight(input.lightId, {
            brightness: input.brightness,
          }),
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
