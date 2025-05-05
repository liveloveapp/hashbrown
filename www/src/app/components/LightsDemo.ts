import { Component, inject, resource, signal } from '@angular/core';
import {
  createTool,
  createToolWithArgs,
  uiChatResource,
} from '@hashbrownai/angular';
import { exposeComponent, s } from '@hashbrownai/core';
import { Light as LightModel } from '../models/light.model';
import { LightsService } from '../services/LightsService';
import { LightsStore } from '../store/LightsStore';
import { Card } from './Card';
import { Composer } from './Composer';
import { ComposerSuggestions } from './ComposerSuggestions';
import { Light } from './Light';
import { Markdown } from './Markdown';
import { Messages } from './Messages';

@Component({
  selector: 'www-lights-demo',
  imports: [Light, Composer, ComposerSuggestions, Messages],
  providers: [LightsStore],
  template: `
    <div class="lights">
      <h3>Lights</h3>
      @for (light of lightsResource.value(); track light.id) {
        <button>
          <www-light [lightId]="light.id" (change)="onChange($event)" />
        </button>
      }
    </div>
    <div class="chat">
      <www-messages [messages]="chat.messages()" />
      <www-composer-suggestions (sendMessage)="sendMessage($event)" />
      <www-composer (sendMessage)="sendMessage($event)" />
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      background: rgba(47, 47, 43, 0.04);
      padding: 64px 32px;
    }

    .lights {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 32px;
      background: #fff;
      border-radius: 12px;
      width: 100%;

      > h3 {
        color: rgba(47, 47, 43, 0.88);
        font: 600 12px/18px sans-serif;
        text-transform: uppercase;
      }
    }

    .chat {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 32px;
      background: #fff;
      border-radius: 12px;
      width: 100%;
    }

    www-messages {
      flex: 1 auto;
    }

    @media screen and (min-width: 1024px) {
      :host {
        grid-template-columns: 400px auto;
      }

      .chat {
        height: calc(100vh - 128px);
      }
    }
  `,
})
export class LightsDemo {
  lightsService = inject(LightsService);
  lightsStore = inject(LightsStore);

  placeholder = signal<string>('Show me all lights');
  value = signal<string>('');

  lightsResource = resource({
    loader: () => {
      const lights = this.lightsService.lights();
      this.lightsStore.loadLights(lights);
      return Promise.resolve(lights);
    },
  });

  chat = uiChatResource({
    // model: 'gemini-2.5-pro-exp-03-25',
    model: 'o4-mini',
    url: '/_/v1/chat',
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant that can answer questions and help with tasks.

          If the user asks for lights, show them the light card for each light.
        `,
      },
    ],
    components: [
      exposeComponent(Markdown, {
        name: 'markdown',
        description: 'Show markdown to the user',
        props: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(Light, {
        name: 'light',
        description: 'Show a light to the user in a card',
        props: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(Card, {
        name: 'card',
        description: 'Show a card to the user',
        children: 'any',
        props: {
          title: s.string('The title of the card'),
        },
      }),
    ],
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          return Promise.resolve({
            name: 'Brian Love',
            email: 'brian@liveloveapp.com',
          });
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => {
          return Promise.resolve(this.lightsStore.entities());
        },
      }),
      createToolWithArgs({
        name: 'updateLight',
        description: 'Update a light',
        schema: s.object('Update a light', {
          id: s.string('The id of the light'),
          changes: s.object('The changes to the light', {
            brightness: s.number('The brightness of the light'),
          }),
        }),
        handler: (args: { id: string; changes: Partial<LightModel> }) => {
          this.onChange(args);
          return Promise.resolve();
        },
      }),
    ],
  });

  onChange(args: { id: string; changes: Partial<LightModel> }) {
    console.log(args);
    this.lightsStore.updateLight(args.id, args.changes);
    this.lightsService.updateLight(args.id, args.changes);
  }

  sendMessage(message: string): void {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
