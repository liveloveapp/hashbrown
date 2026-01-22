import { Component, input, output } from '@angular/core';
import { UiChatResourceRef } from '@hashbrownai/angular';
import { type Chat as HashbrownChat } from '@hashbrownai/core';
import { Step } from '../../services/langgraph.service';
import { ChatInputComponent } from './chat-input.component';
import { MessagesComponent } from './messages.component';

@Component({
  selector: 'app-chat',
  imports: [MessagesComponent, ChatInputComponent],
  template: `
    <app-messages
      [messages]="agent().value()"
      [remoteAgentIsRunning]="remoteAgentIsRunning()"
      [steps]="remoteAgentSteps()"
    />
    <app-chat-input
      [isRunning]="isRunning()"
      (submitted)="onSubmit($event)"
      (stopped)="onStop()"
    />
  `,
  styles: `
    :host {
      height: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 16px;
      background-color: #f0f0f0;
      border-radius: 16px;
    }
  `,
})
export class ChatComponent {
  readonly agent = input.required<UiChatResourceRef<HashbrownChat.AnyTool>>();
  readonly isRunning = input(false);
  readonly remoteAgentIsRunning = input(false);
  readonly remoteAgentSteps = input<Step[]>([]);
  readonly stopped = output<void>();

  protected onSubmit(content: string): void {
    this.agent().sendMessage({ role: 'user', content });
  }

  protected onStop(): void {
    this.stopped.emit();
  }
}

export default ChatComponent;
