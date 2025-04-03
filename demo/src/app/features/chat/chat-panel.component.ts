import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Store } from '@ngrx/store';
import {
  createTool,
  defineChatComponent,
  richChatResource,
} from '@cassini/core';
import { tap } from 'rxjs';
import { AuthService } from '../../shared/auth.service';
import { SmartHomeService } from '../../services/smart-home.service';
import { ChatActions } from './actions';
import { MessagesComponent } from './components/messages.component';
import { ComposerComponent } from './components/composer.component';
import { ChatAiActions } from './actions/chat-ai.actions';
import { LightCardComponent } from './components/light-card.component';
import { s } from '@cassini/core';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    ComposerComponent,
    MessagesComponent,
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
      <app-chat-messages
        [messages]="chat.messages()"
        [components]="components"
      ></app-chat-messages>
    </div>

    <div class="chat-composer">
      <app-chat-composer
        (sendMessage)="chat.sendMessage({ role: 'user', content: $event })"
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

  components = {
    light: LightCardComponent,
  };

  chat = richChatResource({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are a helpful assistant that can answer questions and help with tasks.',
      },
    ],
    components: [
      defineChatComponent(
        'light',
        'Show a light to the user',
        LightCardComponent,
        {
          lightId: s.string('The id of the light'),
        }
      ),
    ],
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        schema: s.object('Empty object', {}),
        handler: () => {
          const auth = inject(AuthService);

          return auth.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        schema: s.object('Empty object', {}),
        handler: () => this.smartHomeService.loadLights(),
      }),
      createTool({
        name: 'controlLight',
        description:
          'Control the light. Brightness is a number between 0 and 100.',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number(
            'The brightness of the light, between 0 and 100'
          ),
        }),
        handler: (input) => {
          return this.smartHomeService
            .controlLight(input.lightId, input.brightness)
            .pipe(
              tap((light) =>
                this.store.dispatch(
                  ChatAiActions.controlLight({
                    lightId: light.id,
                    brightness: light.brightness,
                  })
                )
              )
            );
        },
      }),
    ],
  });

  closePanel() {
    this.store.dispatch(ChatActions.closeChatPanel());
  }
}
