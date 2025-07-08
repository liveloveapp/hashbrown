import { Component, inject, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Chat } from '@hashbrownai/core';
import { CodeModalComponent } from './code-modal.component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-code-tool-chip',
  imports: [MatProgressSpinnerModule, MatIconModule],
  template: `
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
  host: {
    '(click)': 'open()',
  },
})
export class CodeToolChipComponent {
  toolCall = input.required<Chat.AnyToolCall>();
  pending = input.required<string>();
  done = input.required<string>();
  code = input.required<string>();
  dialog = inject(MatDialog);

  open() {
    this.dialog.open(CodeModalComponent, {
      data: {
        code: this.code,
      },
    });
  }
}
