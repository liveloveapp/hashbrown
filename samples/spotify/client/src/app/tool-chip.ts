import { Component, input } from '@angular/core';
import { Chat } from '@hashbrownai/core';

@Component({
  selector: 'spot-tool-chip',
  template: `
    @if (toolCall().status === 'pending') {
      <div class="spinner">
        <!-- TODO: Add a spinner -->
      </div>

      <div class="tool-name">
        {{ pending() }}
      </div>
    } @else if (toolCall().status === 'done') {
      <div class="icon">
        <span class="material-symbols-outlined">check</span>
      </div>

      <div class="tool-name">
        {{ done() }}
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-radius: 16px;
      background-color: #f0f0f0;
      font-size: 12px;
      font-weight: 500;
      color: #000;
      border: 1px solid #e0e0e0;
      width: fit-content;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
})
export class ToolChipComponent {
  toolCall = input.required<Chat.AnyToolCall>();
  pending = input.required<string>();
  done = input.required<string>();
}
