import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Chat } from '@hashbrownai/core';
import { Squircle } from '../squircle';

@Component({
  selector: 'app-tool-chip',
  imports: [MatProgressSpinnerModule, MatIconModule, Squircle],
  template: `
    <div
      class="container"
      appSquircle="8"
      [appSquircleBorderWidth]="2"
      appSquircleBorderColor="rgba(119, 70, 37, 0.32)"
    >
      @if (toolCall().status === 'pending') {
        <div class="spinner">
          <mat-spinner diameter="16"></mat-spinner>
        </div>

        <div class="tool-name">
          {{ pending() }}
        </div>
      } @else if (toolCall().status === 'done') {
        <div class="icon">
          <mat-icon inline="true">check</mat-icon>
        </div>

        <div class="tool-name">
          {{ done() }}
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px 6px 8px;
      background: var(--chocolate-brown-light, #ad907c);
      width: fit-content;
      color: var(--vanilla-ivory, #faf9f0);
      font-family: Fredoka;
      font-size: 10px;
      font-style: normal;
      font-weight: 600;
      line-height: normal;
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
})
export class ToolChip {
  toolCall = input.required<Chat.AnyToolCall>();
  pending = input.required<string>();
  done = input.required<string>();
}
