import { Component, inject } from '@angular/core';
import {
  createTool,
  createToolWithArgs,
  uiChatResource,
} from '@hashbrownai/angular';
import { exposeComponent, s } from '@hashbrownai/core';
import { CardComponent } from './card.component';
import { ComposerComponent } from './composer.component';
import { LightComponent } from './light.component';
import { MarkdownComponent } from './markdown.component';
import { MessagesComponent } from './messages.component';
import { AuthService } from '../services/auth.service';
import { LightsStore } from '../store/lights.store';

@Component({
  selector: 'app-chat',
  imports: [ComposerComponent, MessagesComponent],
  providers: [LightsStore],
  template: `
    <app-messages [messages]="chat.value()" />
    <app-composer (sendMessage)="sendMessage($event)" />
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
  `,
})
export class ChatComponent {
  lightsStore = inject(LightsStore);

  chat = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'lights-chat',
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
    components: [
      exposeComponent(MarkdownComponent, {
        name: 'markdown',
        description: 'Show markdown to the user',
        props: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightComponent, {
        name: 'light',
        description: 'Show a light to the user',
        props: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(CardComponent, {
        name: 'card',
        description: 'Show a card to the user',
        children: 'any',
        props: {
          title: s.streaming.string('The title of the card'),
        },
      }),
    ],
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
