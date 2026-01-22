import { Component, computed, input } from '@angular/core';
import {
  MagicText,
  RenderMessageComponent,
  UiAssistantMessage,
  UiChatMessage,
  UiUserMessage,
} from '@hashbrownai/angular';
import { type Chat } from '@hashbrownai/core';

function isUser(
  message: UiChatMessage<Chat.AnyTool>,
): message is UiUserMessage {
  return message.role === 'user';
}

function isAssistant(
  message: UiChatMessage<Chat.AnyTool>,
): message is UiAssistantMessage<Chat.AnyTool> {
  return message.role === 'assistant';
}

@Component({
  selector: 'app-message',
  imports: [RenderMessageComponent, MagicText],
  template: `
    @if (isUser(message())) {
      @if (userText().trim().length) {
        <div class="container containerRight">
          <div class="message messageUser">
            <hb-magic-text [text]="userText()" />
          </div>
        </div>
      }
    } @else if (isAssistant(message())) {
      <div class="container containerLeft">
        <div class="message messageAssistant">
          <hb-render-message [message]="assistantMessage()!" />
        </div>
      </div>
    }
  `,
  styles: `
    .container {
      display: flex;
      width: 100%;
    }

    .containerLeft {
      justify-content: flex-start;
    }

    .containerRight {
      justify-content: flex-end;
    }

    .message {
      padding: 8px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .messageAssistant {
      color: var(--gray-dark, rgba(61, 60, 58, 1));
    }

    .messageUser {
      background-color: rgba(251, 187, 82, 0.8);
      color: rgba(61, 60, 58, 1);
    }
  `,
})
export class MessageComponent {
  readonly message = input.required<UiChatMessage<Chat.AnyTool>>();

  protected readonly isUser = isUser;
  protected readonly isAssistant = isAssistant;

  protected readonly assistantMessage = computed(() => {
    const value = this.message();
    return isAssistant(value) ? value : null;
  });

  protected readonly userText = computed(() => {
    const value = this.message();
    return typeof value.content === 'string' ? value.content : '';
  });
}
