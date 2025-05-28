import {
  Component,
  effect,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
} from '@hashbrownai/tool-javascript';
import { Store } from '@ngrx/store';
// import variant from '@jitl/quickjs-singlefile-browser-release-asyncify';
import variant from '@jitl/quickjs-singlefile-browser-debug-asyncify';
import { lastValueFrom, tap } from 'rxjs';
import { SmartHomeService } from '../../services/smart-home.service';
import { AuthService } from '../../shared/auth.service';
import { ChatAiActions } from './actions/chat-ai.actions';
import { CardComponent } from './components/card.component';
import { ComposerComponent } from './components/composer.component';
import { LightCardComponent } from './components/light-card.component';
import { MarkdownComponent } from './components/markdown.component';
import { MessagesComponent } from './components/messages.component';
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
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="chat-header">
      <h3>Chat</h3>
    </div>

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

    @if (!simpleDemo && chat.isLoading()) {
      <div class="chat-loading"><mat-spinner></mat-spinner></div>
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
        grid-area: loading;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-loading mat-spinner {
        height: 32px !important;
        width: 32px !important;
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
    debugName: 'simple-chat',
    // model: 'gemini-2.5-flash-preview-04-17',
    model: 'gpt-4.1',
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
        handler: () => lastValueFrom(this.smartHomeService.loadLights()),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: (input) =>
          lastValueFrom(
            this.smartHomeService
              .controlLight(input.lightId, input.brightness)
              .pipe(
                tap((light) => {
                  this.store.dispatch(
                    ChatAiActions.controlLight({
                      lightId: light.id,
                      brightness: light.brightness,
                    }),
                  );
                }),
              ),
          ),
      }),
    ],
  });

  /**
   * --------------------------------------------------------------------------
   * UI chat
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
        handler: () => lastValueFrom(this.smartHomeService.loadLights()),
      }),
    ],
  });
  chat = uiChatResource({
    // model: 'gemini-2.5-pro-preview-05-06',
    model: 'gpt-4.1',
    system: `
      You are a helpful assistant that can answer questions and help with tasks. You should not stringify (aka escape) function arguments.
    `,
    components: [
      exposeComponent(MarkdownComponent, {
        description: 'Show markdown to the user',
        input: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightCardComponent, {
        description: `This option shows a light to the user, with a dimmer for them to control the light.
          Always prefer this option over printing a light's name.`,
        input: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(CardComponent, {
        description: 'Show a card to the user',
        children: 'any',
        input: {
          title: s.streaming.string('The title of the card'),
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
        handler: () => lastValueFrom(this.smartHomeService.loadLights()),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: (input) =>
          lastValueFrom(
            this.smartHomeService
              .controlLight(input.lightId, input.brightness)
              .pipe(
                tap((light) => {
                  this.store.dispatch(
                    ChatAiActions.controlLight({
                      lightId: light.id,
                      brightness: light.brightness,
                    }),
                  );
                }),
              ),
          ),
      }),
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
    debugName: 'ui-chat',
    // debounce: 10000,
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
