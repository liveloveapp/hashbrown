import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { chatResource, createTool, uiChatResource } from '@hashbrownai/angular';
import { Store } from '@ngrx/store';
import { lastValueFrom, tap } from 'rxjs';
import { exposeComponent, s } from '@hashbrownai/core';
import {
  createToolJavaScript,
  defineFunction,
  defineFunctionWithArgs,
} from '@hashbrownai/tool-javascript';
// import variant from '@jitl/quickjs-singlefile-mjs-debug-asyncify';
import { SmartHomeService } from '../../services/smart-home.service';
import { AuthService } from '../../shared/auth.service';
import { ChatActions } from './actions';
import { ChatAiActions } from './actions/chat-ai.actions';
import { ComposerComponent } from './components/composer.component';
import { LightCardComponent } from './components/light-card.component';
import { MessagesComponent } from './components/messages.component';
import { MarkdownComponent } from './components/markdown.component';
import { CardComponent } from './components/card.component';
import { SimpleMessagesComponent } from './components/simple-messages.component';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    ComposerComponent,
    MessagesComponent,
    SimpleMessagesComponent,
  ],
  template: `
    <div class="chat-header">
      <h3>Chat</h3>

      <button
        mat-icon-button
        aria-label="Close chat panel"
        (click)="closePanel()"
      >
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div class="chat-messages">
      @if (simpleDemo) {
        <app-simple-chat-messages [messages]="simpleChat.value()" />
      } @else {
        <app-chat-messages [messages]="chat.messages()" />
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
        width: 400px;
        height: calc(100vh - 64px);
        background-color: var(--mat-sys-surface);
        border-left: 1px solid rgba(255, 255, 255, 0.12);
        grid-template-areas:
          'header'
          'messages'
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

      .chat-messages {
        grid-area: messages;
      }

      .chat-composer {
        grid-area: composer;
        padding: 16px;
      }
    `,
  ],
})
export class ChatPanelComponent {
  store = inject(Store);
  authService = inject(AuthService);
  smartHomeService = inject(SmartHomeService);

  simpleDemo = false;

  /**
   * --------------------------------------------------------------------------
   * Simple chat
   * --------------------------------------------------------------------------
   */
  simpleChat = chatResource({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant that can answer questions and help with tasks.
        `,
      },
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
        handler: () => this.smartHomeService.loadLights(),
      }),
    ],
  });

  /**
   * --------------------------------------------------------------------------
   * UI chat
   * --------------------------------------------------------------------------
   */
  chat = uiChatResource({
    // model: 'gemini-2.5-pro-exp-03-25',
    model: 'o4-mini',
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
      exposeComponent(MarkdownComponent, {
        name: 'markdown',
        description: 'Show markdown to the user',
        props: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightCardComponent, {
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
          title: s.string('The title of the card'),
        },
      }),
    ],
    tools: [
      // createTool({
      //   name: 'getLights',
      //   description: 'Get the current lights',
      //   handler: () => this.smartHomeService.loadLights(),
      // }),
      // createToolJavaScript({
      //   loadVariant: () => Promise.resolve(variant),
      //   functions: [
      //     defineFunction({
      //       name: 'getUser',
      //       description: 'Get information about the current user',
      //       output: s.object('User', {
      //         name: s.string('The name of the user'),
      //         email: s.string('The email of the user'),
      //       }),
      //       handler: () => {
      //         return lastValueFrom(this.authService.getUser());
      //       },
      //     }),
      //     defineFunction({
      //       name: 'getLights',
      //       description: 'Get the current lights',
      //       output: s.array(
      //         'The lights',
      //         s.object('A light', {
      //           id: s.string('The id of the light'),
      //           brightness: s.number('The brightness of the light'),
      //         }),
      //       ),
      //       handler: () => lastValueFrom(this.smartHomeService.loadLights()),
      //     }),
      //     defineFunctionWithArgs({
      //       name: 'createScene',
      //       description: 'Create a new scene',
      //       schema: s.object('Create scene input', {
      //         name: s.string('The name of the scene'),
      //         lights: s.array(
      //           'The lights to add to the scene',
      //           s.object('A light/scene', {
      //             id: s.string('The id of the light/scene'),
      //             brightness: s.number('The brightness of the light/scene'),
      //           }),
      //         ),
      //       }),
      //       output: s.object('Scene', {
      //         id: s.string('The id of the scene'),
      //         name: s.string('The name of the scene'),
      //       }),
      //       handler: (input) => {
      //         return lastValueFrom(
      //           this.smartHomeService.addScene({
      //             name: input.name,
      //             lights: input.lights.map((light) => ({
      //               lightId: light.id,
      //               brightness: light.brightness,
      //             })),
      //           }),
      //         );
      //       },
      //     }),
      //     defineFunctionWithArgs({
      //       name: 'controlLight',
      //       description:
      //         'Control the light. Brightness is a number between 0 and 100.',
      //       schema: s.object('Control light input', {
      //         lightId: s.string('The id of the light'),
      //         brightness: s.number(
      //           'The brightness of the light, between 0 and 100',
      //         ),
      //       }),
      //       output: s.object('Control light output', {
      //         id: s.string('The id of the light'),
      //         name: s.string('The name of the light'),
      //         brightness: s.number('The brightness of the light'),
      //       }),
      //       handler: (input) => {
      //         return lastValueFrom(
      //           this.smartHomeService
      //             .controlLight(input.lightId, input.brightness)
      //             .pipe(
      //               tap((light) =>
      //                 this.store.dispatch(
      //                   ChatAiActions.controlLight({
      //                     lightId: light.id,
      //                     brightness: light.brightness,
      //                   }),
      //                 ),
      //               ),
      //             ),
      //         );
      //       },
      //     }),
      //   ],
      // }),
    ],
  });

  closePanel() {
    this.store.dispatch(ChatActions.closeChatPanel());
  }

  sendMessage(message: string) {
    if (this.simpleDemo) {
      this.simpleChat.sendMessage({ role: 'user', content: message });
    } else {
      this.chat.sendMessage({ role: 'user', content: message });
    }
  }
}
