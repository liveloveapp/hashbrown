import { Component, EventEmitter, Input, input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RenderMessageComponent, UiChatMessage } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat-messages',
  standalone: true,
  imports: [RenderMessageComponent, MatIconModule, MatButtonModule],
  template: `
    @for (message of messages(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message user">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          @if (message.content) {
            <hb-render-message [message]="message" />
          }
        }
        @case ('error') {
          <div class="chat-message error">
            <mat-icon inline>error</mat-icon>
            <span>{{ message.content }}</span>
            @if ($last) {
              <button mat-button (click)="retry.emit()">Retry</button>
            }
          </div>
        }
      }
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        padding: 16px;
      }

      .chat-message.user {
        padding: 16px;
        border-radius: 16px;
        width: 80%;
        background-color: var(--mat-sys-surface-container-highest);
        align-self: flex-end;
        margin-top: 16px;
      }

      hb-render-message {
        align-self: flex-start;
        width: 100%;
        margin-top: 16px;
      }

      .chat-message.error {
        padding: 16px;
        border-radius: 16px;
        width: 80%;
        background-color: var(--mat-sys-error-container);
        align-self: flex-start;
        margin-top: 16px;
        display: flex;
        align-items: center;
      }

      .chat-message.error span {
        width: 100%;
      }

      mat-icon {
        width: 32px !important;
      }

      button[mat-button] {
        align-self: flex-end;
        height: 16px;
      }

      .chat-message.component {
        align-self: flex-start;
        width: 100%;
      }

      .chat-message.tool {
        align-self: flex-start;
        width: 100%;
        font-style: italic;
      }
    `,
  ],
})
export class MessagesComponent {
  messages = input.required<UiChatMessage<any>[]>();

  @Output() retry: EventEmitter<any> = new EventEmitter();
}
