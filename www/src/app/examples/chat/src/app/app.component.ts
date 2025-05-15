import { Component, effect, inject, resource, signal } from '@angular/core';
import {
  createTool,
  createToolWithArgs,
  uiChatResource,
} from '@hashbrownai/angular';
import { exposeComponent, s } from '@hashbrownai/core';
import { CardComponent } from './components/card.component';
import { ComposerComponent } from './components/composer.component';
import { ConfigComponent } from './components/config.component';
import { LightComponent } from './components/light.component';
import { MarkdownComponent } from './components/markdown.component';
import { MessagesComponent } from './components/messages.component';
import { Light } from './models/light';
import { AuthService } from './services/auth.service';
import { LightsStore } from './store/lights.store';
import { setApiKey, setProvider } from './utils/config.util';

@Component({
  selector: 'app-root',
  imports: [
    ComposerComponent,
    ConfigComponent,
    LightComponent,
    MessagesComponent,
  ],
  providers: [LightsStore],
  template: `
    <div class="app">
      <app-config
        [provider]="provider()"
        (apiKeyChange)="apiKey.set($event)"
        (providerChange)="provider.set($event)"
      />
      <div class="lights">
        <h3>Lights</h3>
        @for (light of lightsResource.value(); track light.id) {
          <button>
            <app-light [lightId]="light.id" (change)="onChange($event)" />
          </button>
        }
      </div>
      <div class="chat">
        <app-messages [messages]="chat.value()" />
        <app-composer (sendMessage)="sendMessage($event)"></app-composer>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: rgba(61, 60, 58, 0.08);
      height: 100%;
    }

    .app {
      flex: 1 auto;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr 2fr;
      height: 100%;
      gap: 16px;
      padding: 16px;
    }

    .lights {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      overflow-y: auto;

      > h3 {
        color: rgba(61, 60, 58, 0.88);
        font: 600 12px/18px sans-serif;
        text-transform: uppercase;
      }
    }

    .chat {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      height: 100%;
      grid-row: 3;
      overflow: hidden;
    }

    @media screen and (min-width: 768px) {
      .app {
        grid-template-columns: 320px 1fr;
        grid-template-rows: auto auto;

        > app-config {
          grid-column: 1 / span 2;
          grid-row: 1;
        }

        > .lights {
          grid-column: 1;
          grid-row: 2;
        }

        .chat {
          grid-column: 2;
          grid-row: 2;
        }
      }

      .lights {
        max-height: inherit;
      }
    }

    @media screen and (min-width: 1024px) {
      .app {
        grid-template-columns: 400px auto;
      }
    }
  `,
})
export class App {
  lightsStore = inject(LightsStore);
  apiKey = signal<string>('');
  provider = signal('openai');

  chat = uiChatResource({
    model: 'gpt-4.1',
    prompt:
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

  syncApiKey = effect(() => {
    const apiKey = this.apiKey();
    setApiKey(apiKey);
  });

  syncProvider = effect(() => {
    const provider = this.provider();
    setProvider(provider);
  });

  lightsResource = resource({
    loader: () => {
      const lights = this.lightsStore.entities();
      return Promise.resolve(lights);
    },
  });

  onChange(args: { id: string; changes: Partial<Light> }) {
    this.lightsStore.updateLight(args.id, args.changes);
  }

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
