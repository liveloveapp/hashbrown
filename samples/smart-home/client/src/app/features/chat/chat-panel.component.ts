import {
  Component,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  chatResource,
  createTool,
  createToolWithArgs,
  exposeComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import {
  createToolJavaScript,
  defineAsyncRuntime,
  defineFunction,
  defineFunctionWithArgs,
} from '@hashbrownai/tool-javascript';
import { Store } from '@ngrx/store';
import variant from '@jitl/quickjs-singlefile-browser-debug-asyncify';
import { lastValueFrom } from 'rxjs';
import { SmartHomeService } from '../../services/smart-home.service';
import { AuthService } from '../../shared/auth.service';
import { ChatAiActions } from './actions/chat-ai.actions';
import { ComposerComponent } from './components/composer.component';
import { LightComponent } from '../lights/light.component';
import { MarkdownComponent } from './components/markdown.component';
import { MessagesComponent } from './components/messages.component';
import { SimpleMessagesComponent } from './components/simple-messages.component';
import { LightListComponent } from '../lights/light-list.component';
import { SceneComponent } from '../scenes/scene.component';
import { Overlay, OverlayModule } from '@angular/cdk/overlay';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    ComposerComponent,
    MessagesComponent,
    SimpleMessagesComponent,
    MatProgressBarModule,
    OverlayModule,
  ],
  template: `
    @if (!simpleDemo && chat.isLoading()) {
      <div class="chat-loading">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      </div>
    }

    <div #contentDiv class="chat-messages">
      @if (simpleDemo) {
        <app-simple-chat-messages [messages]="simpleChat.value()" />
      } @else {
        <app-chat-messages
          [messages]="chat.value()"
          (retry)="retryMessages()"
        />
      }
    </div>

    <div class="chat-composer">
      <app-chat-composer
        (sendMessage)="sendMessage($event)"
      ></app-chat-composer>
    </div>
  `,
  styles: [
    `
      :host {
        display: grid;
        position: fixed;
        top: 64px;
        bottom: 0;
        right: 0;
        width: 40%;
        height: calc(100vh - 64px);
        background-color: var(--mat-sys-surface);
        border-left: 1px solid rgba(255, 255, 255, 0.12);
        grid-template-areas:
          'header'
          'messages'
          'clearHelp'
          'loading'
          'composer';
        grid-template-rows: auto 1fr auto;
        grid-template-columns: 1fr;
      }

      .chat-header {
        grid-area: header;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      .chat-loading {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        justify-content: center;
      }

      .chat-messages {
        grid-area: messages;
        flex-grow: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .chat-composer {
        grid-area: composer;
        padding: 0 16px 16px;
      }

      .overlay-clear {
        grid-area: clearHelp;
        display: flex;
        align-items: center;
        width: 100%;
        justify-content: center;
        margin-bottom: 8px;
      }
    `,
  ],
})
export class ChatPanelComponent {
  store = inject(Store);
  authService = inject(AuthService);
  smartHomeService = inject(SmartHomeService);
  overlay = inject(Overlay);

  simpleDemo = false;

  private contentDiv =
    viewChild.required<ElementRef<HTMLDivElement>>('contentDiv');

  constructor() {
    effect(() => {
      // React when messages change
      this.chat.value();

      const contentDiv = this.contentDiv().nativeElement;
      contentDiv.scrollTop = contentDiv.scrollHeight;
    });
  }

  /**
   * --------------------------------------------------------------------------
   * Simple chat
   * --------------------------------------------------------------------------
   */
  simpleChat = chatResource({
    model: 'gpt-4.1',
    debugName: 'simple-chat',
    system: `
      You are a helpful assistant that can answer questions and help with tasks.
    `,
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: async () => {
          const smartHome = inject(SmartHomeService);

          return smartHome.loadLights();
        },
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) => {
          const smartHome = inject(SmartHomeService);
          const store = inject(Store);

          const result = await smartHome.controlLight(
            input.lightId,
            input.brightness,
          );

          store.dispatch(
            ChatAiActions.controlLight({
              lightId: result.id,
              brightness: result.brightness,
            }),
          );

          return result;
        },
      }),
    ],
  });

  sendSimpleMessage(message: string) {
    this.simpleChat.sendMessage({ role: 'user', content: message });
  }

  /**
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   * --------------------------------------------------------------------------
   * JavaScript Runtime
   * --------------------------------------------------------------------------
   */
  runtime = defineAsyncRuntime({
    loadVariant: () => Promise.resolve(variant),
    functions: [
      defineFunction({
        name: 'getLights',
        description: 'Get the current lights',
        output: s.array(
          'The lights',
          s.object('A light', {
            id: s.string('The id of the light'),
            brightness: s.number('The brightness of the light'),
          }),
        ),
        handler: () => this.smartHomeService.loadLights(),
      }),
      defineFunctionWithArgs({
        name: 'addLight',
        description: 'Add a light',
        input: s.object('Add light input', {
          name: s.string('The name of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        output: s.object('The light', {
          id: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) => {
          const light = await this.smartHomeService.addLight(input);

          this.store.dispatch(
            ChatAiActions.addLight({
              light,
            }),
          );

          return light;
        },
      }),
      defineFunctionWithArgs({
        name: 'createScene',
        description: 'Apply a scene',
        input: s.object('Scene to Create', {
          name: s.string('The name of the scene'),
          lights: s.array(
            'The lights to add to the scene',
            s.object('Light in a Scene', {
              lightId: s.string('The id of the light'),
              brightness: s.number('The brightness of the light'),
            }),
          ),
        }),
        output: s.object('The scene', {
          id: s.string('The id of the scene'),
          lights: s.array(
            'The lights in the scene',
            s.object('Light in a Scene', {
              lightId: s.string('The id of the light'),
              brightness: s.number('The brightness of the light'),
            }),
          ),
        }),
        handler: async (input) => {
          const scene = await this.smartHomeService.addScene(input);

          this.store.dispatch(
            ChatAiActions.addScene({
              scene,
            }),
          );

          return scene;
        },
      }),
    ],
  });

  /**
   * --------------------------------------------------------------------------
   * UI chat
   * --------------------------------------------------------------------------
   */

  chat = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'ui-chat',
    system: `
      You are a helpful assistant for a smart home app. You are speaking to the user
      in a web app, and their smart home interface is to the left. 

      You can help with various things like:
      * setting up a smart home (with lights, scenes and scheduling)
      * showing views of entities in the chat window (ex: "Show me my living room lights")

      If the user asks you to help them set up their smart home, ask them what lights and scenes
      they want to create, then write a script for the javascript tool that creates those scenes.

      Always prefer writing a single script for the javascript tool over calling the javascript
      tool multiple times.
    `,
    components: [
      exposeComponent(MarkdownComponent, {
        description: 'Show markdown to the user',
        input: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightComponent, {
        description: `This option shows a light to the user, with a dimmer for them to control the light.
          Always prefer this option over printing a light's name. Always prefer putting these in a list.`,
        input: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(LightListComponent, {
        description: 'Show a list of lights to the user',
        input: {
          title: s.string('The name of the list'),
        },
        children: 'any',
      }),
      exposeComponent(SceneComponent, {
        description:
          "Show a scene to the user. Always prefer this option over printing a scene's name.",
        input: {
          sceneId: s.string('The id of the scene'),
        },
      }),
    ],
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => this.authService.getUser(),
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => lastValueFrom(this.smartHomeService.loadLights$()),
      }),
      createTool({
        name: 'getScenes',
        description: 'Get the current scenes',
        handler: () => lastValueFrom(this.smartHomeService.loadScenes$()),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) => {
          const light = await this.smartHomeService.controlLight(
            input.lightId,
            input.brightness,
          );

          this.store.dispatch(
            ChatAiActions.controlLight({
              lightId: light.id,
              brightness: light.brightness,
            }),
          );

          return light;
        },
      }),
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
  });

  sendMessage(message: string) {
    if (this.simpleDemo) {
      this.simpleChat.sendMessage({ role: 'user', content: message });
    } else {
      this.chat.sendMessage({ role: 'user', content: message });
    }
  }

  retryMessages() {
    this.chat.resendMessages();
  }
}
