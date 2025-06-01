import {
  Component,
  effect,
  ElementRef,
  inject,
  ViewChild,
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
import { LightComponent, LightIconSchema } from '../lights/light.component';
import { MarkdownComponent } from './components/markdown.component';
import { MessagesComponent } from './components/messages.component';
import { SimpleMessagesComponent } from './components/simple-messages.component';
import {
  LightListComponent,
  LightListIconSchema,
} from '../lights/light-list.component';
import { SceneComponent } from '../scenes/scene.component';

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
    `,
  ],
})
export class ChatPanelComponent {
  store = inject(Store);
  authService = inject(AuthService);
  smartHomeService = inject(SmartHomeService);

  simpleDemo = false;

  @ViewChild('contentDiv') private contentDiv: ElementRef = {} as ElementRef;

  constructor() {
    effect(() => {
      // React when messages change
      this.chat.value();
      if (this.contentDiv.nativeElement) {
        this.contentDiv.nativeElement.scrollTop =
          this.contentDiv.nativeElement.scrollHeight;
      }
    });
  }

  /**
   * --------------------------------------------------------------------------
   * Simple chat
   * --------------------------------------------------------------------------
   */
  simpleChat = chatResource({
    model: 'palmyra-x5',
    // model: 'gemini-2.5-flash-preview-04-17',
    debugName: 'simple-chat',
    system: `You are a helpful assistant that can answer questions and help with tasks. You should not stringify (aka escape) function arguments`,
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const auth = inject(AuthService);

          return auth.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => this.smartHomeService.loadLights(),
      }),
    ],
  });

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
    model: 'palmyra-x5',
    // model: 'gemini-2.5-pro-preview-05-06',
    // model: 'gpt-4o@2025-01-01-preview',
    debugName: 'ui-chat',
    system: `
      You are a helpful assistant that can answer questions and help with tasks. 
      
      You should not double-escape (in the JSON meaning) function arguments.

      If a user refers to a light by name, the light ID can be found by getting the 
      list of light entities and finding the light ID for the given name.

      For example, the light named "Office Light" would match the entity:
      {
        brightness: 100,
        id: "16fece1a-3038-4394-83e3-ddac09fe4b66",
        name: "Test 2"
      }

      So, the lightId property would be the entity's 'id' value (in this case "16fece1a-3038-4394-83e3-ddac09fe4b66").

      Similarly, if a user refers to a scene by name, the scene ID can be found by getting the 
      list of scene entities and finding the scene ID for the given name.

      Response schema will be in JSONSchema format, but don't include bits of schema in the response.

      For example, if the request format looks like this:
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "ui": {
                "type": "array",
                "items": {
                    "$ref": "#/$defs/anyOf"
                },
                "description": "List of elements"
            }
        },
        "required": [
            "ui"
        ],
        "additionalProperties": false,
        "description": "UI",
        "$defs": {
            "anyOf": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                            "1"
                        ],
                        "properties": {
                            "1": {
                                "type": "object",
                                "properties": {
                                    "$tagName": {
                                        "type": "string",
                                        "const": "app-light",
                                        "description": "app-light"
                                    },
                                    "$props": {
                                        "type": "object",
                                        "properties": {
                                            "lightId": {
                                                "type": "string",
                                                "description": "The id of the light"
                                            },
                                            "icon": {
                                                "type": "string",
                                                "enum": [
                                                    "floor_lamp",
                                                    "table_lamp",
                                                    "wall_lamp",
                                                    "lightbulb"
                                                ]
                                            }
                                        },
                                        "required": [
                                            "lightId",
                                            "icon"
                                        ],
                                        "additionalProperties": false,
                                        "description": "Props"
                                    }
                                },
                                "required": [
                                    "$tagName",
                                    "$props"
                                ],
                                "additionalProperties": false,
                                "description": "This option shows a light to the user, with a dimmer for them to control the light.\n          Always prefer this option over printing a light's name. Always prefer putting these in a list.\n        \n          "
                            }
                        }
                    }
                ]
            }
        }
    }

    Then, the response could look like this:
    {
      "ui":[
        {
          "1":{
            "$props":{
              "icon":"lightbulb",
              "lightId":"16fece1a-3038-4394-83e3-ddac09fe4b66"
            },
            "$tagName":"app-light"
          }
        }
      ]
    }

    Some UI components can have children.  For example, a LightListComponent 
    can contain zero, one or more LightComponents.
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
          Always prefer this option over printing a light's name. Always prefer putting these in a list.
        
          `,
        input: {
          lightId: s.string('The id of the light'),
          icon: LightIconSchema,
        },
      }),
      exposeComponent(LightListComponent, {
        description: 'Show a list of lights to the user',
        input: {
          title: s.string('The name of the list'),
          icon: LightListIconSchema,
        },
        children: 'any',
      }),
      exposeComponent(SceneComponent, {
        description: 'Show a scene to the user',
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
        description: 'Get the current lights, including their IDs',
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
