import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { createTool, structuredChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { LightsStore } from '../store/lights.store';
import { ComposerComponent } from './composer.component';

@Component({
  selector: 'app-chat',
  imports: [ComposerComponent, JsonPipe],
  providers: [LightsStore],
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
              <pre>{{ message.content | json }}</pre>
            </div>
          }
        }
      }
    </div>
    <app-composer
      (sendMessage)="sendMessage($event)"
      placeholder="Show me all lights"
    />
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

  chat = structuredChatResource({
    model: 'gpt-4.1',
    debugName: 'lights-chat',
    system: `
      Please return a JSON object that contains the lights that the user mentions.
    `,
    schema: s.object('Output', {
      lights: s.array(
        'The lights',
        s.object('Light', {
          id: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
      ),
    }),
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => this.lightsStore.entities(),
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
