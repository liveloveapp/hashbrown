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
  helpMarkerOverlayRefs: OverlayRef[] = [];
  @ViewChild('contentDiv') private contentDiv: ElementRef = {} as ElementRef;
  simpleDemo = false;

  /**
   * --------------------------------------------------------------------------
   * Simple chat
   * --------------------------------------------------------------------------
   */
  simpleChat = chatResource({
    model: 'gemini-2.5-flash',
    system: `
      You are a helpful assistant that can answer questions and help with tasks.
    `,
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
    model: 'gpt-4.1',
    // model: 'gemini-2.5-pro',
    // model: 'gpt-4o@2025-01-01-preview',
    // model: 'palmyra-x5',
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

      You can locate important elements via findHTMLElementBySelector:
      * the argument for findHTMLElementByXPathSelector is a precise XPath selector
      * Avoid using generic tags like 'h1' alone. Instead, combine them with other attributes or structural relationships to form a unique selector.
      * Selectors should not include "main.chatPanelOpen"
      * If you cannot locate an element after 3 tries, **give up** and the user know.
      
      Prefer findHTMLElementByXPathSelector, whose argument is a precise XPath selector.  Xpath selectors can be based on text matching,
      making them more suitable for finding interactive elements by name.

      When a user asks for an explanation of or help with a page:
      * ignore the chat panel and its contents unless the user explicitly asks about the chat panel
      * always re-retrieve the HTML for the page (via getPageHTML)
      * only mark the 3-5 most important parts of the page
      * don't callout individual elements in a vertical list (i.e. describe a list of lights, but not each light)
      * place markers overlayed on the page that match up with sections in the description  
      
      **Important Rules**
      * When a user requests navigation (such as 'go to the lights page'), do not show light controls, explanations, or summaries unless the user explicitly asks for them. Only perform the navigation action. Do not generate any output in the main chat window unless further instructions are given.
        * Example 1: "Take me to the schedule scenes page" should cause navigation but no explanation or controls.
        * Example 2: "Navigate to the lights page" should cause navigation but no explanation or controls.
        * Example 3: "Walk me through the Lights page" (when on the Scenes page) should cause navigation and _also_ explanation.
      * If a user does not ask for an explanation or help understanding, don't provide any explanation. For example, if a user asks to click an element or go to a different page, just do that without providing page explanation.
      * If a user asks for navigation (like, "go the lights page" or "take me to the lights page"), don't show controls in the chat.
        * Example: "Navigate to the lights page"
      * Ground your mathematical calculations using the javascript tool.

      Please do not stringify (aka escape) function arguments.  Also, make sure not to include bits of JSON Schema in the function 
      arguments and returned structured data. 
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
        description: 'Get the current lights',
        handler: () => lastValueFrom(this.smartHomeService.loadLights$()),
      }),
      createTool({
        name: 'getScenes',
        description: 'Get the current scenes',
        handler: () => lastValueFrom(this.smartHomeService.loadScenes$()),
      }),
      createTool({
        name: 'getPageHTML',
        description: 'Get the currently rendered page HTML',
        handler: () => {
          const fullHTML = document.documentElement.outerHTML;

          const sanitized = sanitizeHtml(fullHTML, {
            allowedAttributes: {
              '*': [
                'href',
                'data-*',
                'alt',
                'class',
                'style',
                'aria-*',
                'role',
                'routerLink',
              ],
            },
          });

          return Promise.resolve(sanitized);
        },
      }),
      createTool({
        name: 'findHTMLElementByXPathSelector',
        description: 'Find the html element via a unique XPath.',
        schema: s.object('Args', {
          xpathSelector: s.string(
            'A unique XPath selector that is crafted to only return one element',
          ),
        }),
        handler: (input) => {
          const result = document.evaluate(input.xpathSelector, document);

          const foundElement = result.iterateNext();

          if (foundElement) {
            const elementId = uuid();

            if (foundElement instanceof Element) {
              (foundElement as Element).setAttribute(
                'data-element-id',
                elementId,
              );

              return Promise.resolve(elementId);
            }
          }
          return Promise.resolve('');
        },
      }),
      createTool({
        name: 'clickElement',
        description: 'Click.',
        schema: s.object('Click an element', {
          name: s.streaming.string(
            'User-friendly name of the element to click',
          ),
          elementId: s.string(
            'A uuid that is a unique data-element-id value for the target of the topic marker',
          ),
        }),
        handler: async (input) => {
          const dialog = inject(MatDialog);

          const dialogRef = dialog.open(ConfirmComponent, {
            data: {
              title: 'Click Element',
              message: `Are you sure you want to click ${input.name}?`,
            },
          });

          const result = await lastValueFrom(dialogRef.afterClosed());

          if (result) {
            const element = document.querySelector(
              `[data-element-id="${input.elementId}`,
            );

            if (element) {
              (element as HTMLElement).click();
            }

            return true;
          }

          return false;
        },
      }),
      createTool({
        name: 'drawTopicMarker',
        description:
          'Create a circle with a letter.  Used to visually associate things in the UI with topics in chat.',
        schema: s.object('Create marker on UI', {
          elementId: s.string(
            'A uuid that is a unique data-element-id value for the target of the topic marker',
          ),
          label: s.string(
            'A single capital letter that should match a label in the explanatory text',
          ),
        }),
        handler: (input) => {
          const element = document.querySelector(
            `[data-element-id="${input.elementId}`,
          );

          if (!element) {
            return Promise.resolve(false);
          }

          const overlayRef = this.overlay.create({
            positionStrategy: this.overlay
              .position()
              .flexibleConnectedTo(element)
              .withPositions([
                {
                  originX: 'center',
                  originY: 'center',
                  overlayX: 'center',
                  overlayY: 'top',
                },
              ]),
            scrollStrategy: this.overlay.scrollStrategies.reposition(),
            hasBackdrop: false,
          });

          this.helpMarkerOverlayRefs.push(overlayRef);

          const marker = new ComponentPortal(HelpTopicMarkerComponent);
          const markerRef = overlayRef.attach(marker);
          markerRef.setInput('markerLabel', input.label);
          return Promise.resolve(true);
        },
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
      createToolJavaScript({
        runtime: this.runtime,
      }),
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
}
