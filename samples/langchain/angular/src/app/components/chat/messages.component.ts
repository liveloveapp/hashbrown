import { Component, effect, ElementRef, input, viewChild } from '@angular/core';
import { UiChatMessage } from '@hashbrownai/angular';
import { type Chat } from '@hashbrownai/core';
import { Step } from '../../services/langgraph.service';
import { MessageComponent } from './message.component';
import { StepsComponent } from './steps.component';

@Component({
  selector: 'app-messages',
  imports: [MessageComponent, StepsComponent],
  template: `
    <div class="scrollArea" #scrollArea>
      <div class="messages">
        @for (message of messages(); track $index) {
          <app-message [message]="message" />
        }
      </div>
      @if (remoteAgentIsRunning()) {
        <div class="steps">
          <app-steps [steps]="steps()" />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .scrollArea {
      flex: 1;
      overflow-y: auto;
      padding-right: 4px;
    }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-left: 8px;
      padding-right: 8px;
    }

    .steps {
      padding: 4px 8px 12px;
    }
  `,
})
export class MessagesComponent {
  readonly messages = input.required<UiChatMessage<Chat.AnyTool>[]>();
  readonly remoteAgentIsRunning = input(false);
  readonly steps = input<Step[]>([]);

  private readonly scrollArea =
    viewChild<ElementRef<HTMLElement>>('scrollArea');

  constructor() {
    effect(() => {
      // Trigger scroll whenever messages change
      this.messages();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  private scrollToBottom() {
    const ref = this.scrollArea();
    if (!ref) return;
    const el = ref.nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }
}
