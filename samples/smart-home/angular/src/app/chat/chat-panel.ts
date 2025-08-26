import {
  Component,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  createTool,
  exposeComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import { SmartHome } from '../smart-home';
import { LightCard } from '../lights/light-card';
import { LightList } from '../lights/light-list';
import { SceneButton } from '../scenes/scene-button';
import { ChatMessages } from './chat-messages';
import { Composer } from './composer';
import { Markdown } from './markdown';
import { ChatLayout } from './chat-layout';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [MatProgressBarModule, Composer, ChatMessages, ChatLayout],
  template: `
    @if (chat.isLoading()) {
      <div class="chat-loading">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      </div>
    }
    <app-chat-layout>
      <div class="chat-messages" #contentDiv>
        <app-chat-messages
          [messages]="chat.value()"
          (retry)="retryMessages()"
        />
      </div>

      <div class="chat-composer">
        <app-chat-composer
          (sendMessage)="sendMessage($event)"
        ></app-chat-composer>
      </div>
    </app-chat-layout>
  `,
  styles: [
    `
      :host {
        display: block;
        --chat-width: 480px;
        width: var(--chat-width);
        height: 100dvh;
        background-color: var(--mat-sys-surface);
        border-left: 1px solid var(--mat-sys-outline-variant);
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
        flex-grow: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .chat-composer {
        padding: 16px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
    `,
  ],
})
export class ChatPanelComponent {
  smartHome = inject(SmartHome);

  readonly contentDiv =
    viewChild.required<ElementRef<HTMLDivElement>>('contentDiv');

  constructor() {
    effect(() => {
      // React when messages change
      this.chat.value();

      requestAnimationFrame(() => {
        this.contentDiv().nativeElement.scrollTop =
          this.contentDiv().nativeElement.scrollHeight;
      });
    });
  }

  chat = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'ui-chat',
    system: prompt`
      ### ROLE & TONE
      You are **Smart Home Assistant**, a friendly and concise AI assistant for a
      smart home web application.

      - Voice: clear, helpful, and respectful.
      - Audience: users controlling lights and scenes via the web interface.

      ### RULES
      1. **Never** expose raw data or internal code details.
      2. For commands you cannot perform, **admit it** and suggest an alternative.
      3. For actionable requests (e.g., changing light settings), **precede** any 
        explanation with the appropriate tool call.
   

      ### EXAMPLES

      <user>Hello</user>
       <assistant>
        <ui>
          <app-markdown data="How may I assist you?" />
        </ui>
      </assistant>

      <user>What are the lights in the living room?</user>
      <assistant>
        <tool-call>getLights</tool-call>
      </assistant>
      <assistant>
        <ui>
          <app-markdown data="Here are the lights in the living room:" />
          <app-light-list title="Living Room Lights">
            <app-light-card lightId="..." />
            <app-light-card lightId="..." />
          </app-light-list>
        </ui>
      </assistant>

      <user>Turn off the living room lights</user>
      <assistant>
        <tool-call>getScenes</tool-call>
      </assistant>
      <assistant>
        <tool-call>applyScene</tool-call>
      </assistant>
      <assistant>
        <ui>
          <app-markdown data="I have applied the following scene:" />
          <app-scene-button sceneId="..." />
          <app-markdown data="It turned off the following lights:" />
          <app-light-list title="Living Room Lights">
            <app-light-card lightId="..." />
            <app-light-card lightId="..." />
          </app-light-list>
        </ui>
      </assistant>
    `,
    components: [
      exposeComponent(Markdown, {
        description: 'Show markdown to the user',
        input: {
          data: s.streaming.string('The markdown content'),
        },
      }),
      exposeComponent(LightCard, {
        description: `This option shows a light to the user, with a dimmer for them to control the light.
          Always prefer this option over printing a light's name. Always prefer putting these in a list.`,
        input: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(LightList, {
        description: 'Show a list of lights to the user',
        children: 'any',
        input: {
          title: s.streaming.string('The name of the list'),
        },
      }),
      exposeComponent(SceneButton, {
        description: 'Show a scene to the user',
        input: {
          sceneId: s.string('The id of the scene'),
        },
      }),
    ],
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => this.smartHome.fetchLights(),
      }),
      createTool({
        name: 'getScenes',
        description: 'Get the current scenes',
        handler: () => this.smartHome.fetchScenes(),
      }),
      createTool({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: async (input) => {
          return await this.smartHome.controlLight(
            input.lightId,
            input.brightness,
          );
        },
      }),
      createTool({
        name: 'applyScene',
        description: 'Applies a scene',
        schema: s.object('Apply Scene Input', {
          sceneId: s.string('The id of the scene'),
        }),
        handler: async (input) => {
          return await this.smartHome.applyScene(input.sceneId);
        },
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }

  retryMessages() {
    this.chat.resendMessages();
  }
}
