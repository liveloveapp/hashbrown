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
  createRuntime,
  createRuntimeFunction,
  createTool,
  createToolJavaScript,
  exposeComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Store } from '@ngrx/store';
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
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import sanitizeHtml from 'sanitize-html';
import { HelpTopicMarkerComponent } from '../../components/help-topic-marker.component';
import { v4 as uuid } from 'uuid';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmComponent } from './components/confirm.component';

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

    @if (helpMarkerOverlayRefs.length > 0) {
      <div class="overlay-clear">
        <button extended matButton="filled" (click)="clearOverlays()">
          Clear Help Markers
        </button>
      </div>
    }

    <div class="chat-composer">
      @if (simpleChat.isLoading() || chat.isLoading()) {
        <button
          class="cancel-button"
          extended
          matButton="outlined"
          (click)="stop()"
        >
          Cancel
        </button>
      } @else {
        <app-chat-composer
          (sendMessage)="sendMessage($event)"
        ></app-chat-composer>
      }
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

      .cancel-button {
        width: 100%;
        padding: 24px 0;
        border-radius: 32px;
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
  helpMarkerOverlayRefs: OverlayRef[] = [];
  @ViewChild('contentDiv') private contentDiv: ElementRef = {} as ElementRef;
  simpleDemo = false;

  /**
   * --------------------------------------------------------------------------
   * Simple chat
   * --------------------------------------------------------------------------
   */
  simpleChat = chatResource({
    model: 'gpt-oss:120b',
    debugName: 'simple-chat',
    system: `
      You are a helpful assistant that can answer questions and help with tasks.
    `,
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => this.authService.getUser(),
      }),
    ],
  });

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
   *
   *
   *
   *
   *
   * --------------------------------------------------------------------------
   * Runtime
   * --------------------------------------------------------------------------
   */
  runtime = createRuntime({
    functions: [
      createRuntimeFunction({
        name: 'getLights',
        description: 'Get the current lights',
        result: s.array(
          'The lights',
          s.object('A light', {
            id: s.string('The id of the light'),
            brightness: s.number('The brightness of the light'),
          }),
        ),
        handler: () => this.smartHomeService.loadLights(),
      }),
      createRuntimeFunction({
        name: 'addLight',
        description: 'Add a light',
        args: s.object('Add light input', {
          name: s.string('The name of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        result: s.object('The light', {
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
      createRuntimeFunction({
        name: 'createScene',
        description: 'Apply a scene',
        args: s.object('Scene to Create', {
          name: s.string('The name of the scene'),
          lights: s.array(
            'The lights to add to the scene',
            s.object('Light in a Scene', {
              lightId: s.string('The id of the light'),
              brightness: s.number('The brightness of the light'),
            }),
          ),
        }),
        result: s.object('The scene', {
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
    model: 'gpt-oss:20b',
    debugName: 'ui-chat',
    system: `
      You are a helpful assistant for a smart home app. You are speaking to the user
      in a web app, and their smart home interface is to the left. 

      You can help with various things like:
      * setting up a smart home (with lights, scenes and scheduling)
      * page navigation (ex: Go to "lights")
      * showing views of entities in the chat window (ex: "Show me my living room lights")
      * explaining whatever the current page is to varying levels of detail

      If the user asks you to help them set up their smart home, ask them what lights and scenes
      they want to create, then write a script for the javascript tool that creates those scenes.

      Always prefer writing a single script for the javascript tool over calling the javascript
      tool multiple times.

      Please do not stringify (aka escape) function arguments.  Also, make sure not to include bits of JSON Schema in the function 
      arguments and returned structured data. 

      # Examples
      User: What lights are in the living room?
      Assistant:
        [tool_call] getLights()
        [tool_call_result]
          [
            {
              "id": "8ba9469b-82a0-43f7-bf02-89315a4b8554",
              "name": "Living Room Ceiling",
              "brightness": 50
            },
            {
              "id": "c4b9348e-a654-4b60-acd3-cfca97c59706",
              "name": "Living Room Floor",
              "brightness": 50
            },
            {
              "id": "a5b26c6a-36b0-4f09-948b-ddff5bfba385",
              "name": "Living Room Ambient",
              "brightness": 50
            }
          ]
        ]
      Assistant:
        {
          "ui": [
            {
              "0": {
                "$tagName": "app-markdown",
                "$props": {
                  "data": "# Living Room Lights:"
                }
              }
            },
            {
              "1": {
                "$tagName": "app-light",
                "$props": {
                  "lightId": "8ba9469b-82a0-43f7-bf02-89315a4b8554",
                  "icon": "lightbulb"
                }
              }
            },
            {
              "1": {
                "$tagName": "app-light",
                "$props": {
                  "lightId": "c4b9348e-a654-4b60-acd3-cfca97c59706",
                  "icon": "floor_lamp"
                }
              }
            },
            {
              "1": {
                "$tagName": "app-light",
                "$props": {
                  "lightId": "a5b26c6a-36b0-4f09-948b-ddff5bfba385",
                  "icon": "lightbulb"
                }
              }
            }
          ]
        }

      IMPORTANT: in the JSON, the keys are in the index order of the UI components. It
      is not the order of the UI components. 
       - 0 is the app-markdown component
       - 1 is the app-light component
       - 2 is the app-scene component

      
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
          icon: LightIconSchema,
        },
      }),
      // exposeComponent(LightListComponent, {
      //   description: 'Show a list of lights to the user',
      //   input: {
      //     title: s.string('The name of the list'),
      //     icon: LightListIconSchema,
      //   },
      //   children: 'any',
      // }),
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
        description: 'Get the current lights',
        handler: () => lastValueFrom(this.smartHomeService.loadLights$()),
      }),
      createTool({
        name: 'getScenes',
        description: 'Get the current scenes',
        handler: () => lastValueFrom(this.smartHomeService.loadScenes$()),
      }),
      createTool({
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
      // createToolJavaScript({
      //   runtime: this.runtime,
      // }),
    ],
  });

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

  clearOverlays() {
    this.helpMarkerOverlayRefs.forEach((overlayRef) => {
      overlayRef.dispose();
    });

    this.helpMarkerOverlayRefs.length = 0;
  }

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

  stop() {
    if (this.simpleDemo) {
      this.simpleChat.stop();
    } else {
      this.chat.stop();
    }
  }
}
