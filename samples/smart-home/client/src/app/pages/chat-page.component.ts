import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { chatResource, createTool } from '@hashbrownai/angular';
import { z } from 'zod';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-chat-page',
  template: `
    <div class="chat-messages">
      @for(message of chat.messages(); track $index) { @switch(message.role) {
      @case('user') {
      <p class="user-message">
        {{ message.content }}
      </p>
      } @case('assistant') {
      <p class="assistant-message">
        {{ message.content }}
      </p>
      @if (message.tool_calls) {
      <pre class="tool-message">
        {{ message.tool_calls | json }}
      </pre
      >
      } } @default {
      <p class="system-message">
        <strong>{{ message.role }}</strong>
        {{ message.content }}
      </p>
      } } } @if(chat.error()) {
      <p class="error-message">
        {{ chat.error() }}
      </p>
      }
    </div>
    <div class="chat-input">
      <textarea
        #textarea
        class="chat-input-textarea"
        placeholder="Type your message here..."
      ></textarea>
      <button (click)="sendMessage(textarea)">Send Message</button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: 1fr 120px;
      height: 100vh;
    }

    .chat-messages {
      overflow-y: auto;
      padding: 48px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100vw;
    }

    .user-message {
      align-self: flex-end;
      padding: 16px;
      background-color: #dedad9;
      max-width: 60%;
      border-radius: 2px;
    }

    .assistant-message {
      width: 100%;
      padding: 16px;
      justify-self: flex-start;
      border-radius: 2px;
    }

    .system-message {
      color: gray;
    }

    .chat-input {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
  imports: [JsonPipe],
})
export class ChatPageComponent {
  chat = chatResource({
    model: 'gpt-4o',
    messages: [],
    tools: [
      createTool({
        name: 'getUserInfo',
        description: 'Get the information for the current user',
        schema: z.object({}),
        handler: () => {
          const auth = inject(AuthService);

          return auth.getCurrentUser();
        },
      }) as any,
    ],
  });

  sendMessage(textarea: HTMLTextAreaElement) {
    this.chat.sendMessage({
      role: 'user',
      content: textarea.value,
    });
    textarea.value = '';
  }
}
