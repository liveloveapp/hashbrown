import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-chat-input',
  template: `
    <div class="chat-input">
      <textarea
        class="text-input"
        [value]="userQuery()"
        (input)="userQuery.set($any($event.target).value ?? '')"
        [attr.placeholder]="placeholder()"
        [disabled]="isRunning()"
        (keydown)="onKeyDown($event)"
      ></textarea>
      <button
        class="action"
        type="button"
        (click)="isRunning() ? onStop() : onSubmit()"
      >
        {{ isRunning() ? 'Stop' : 'Submit' }}
      </button>
    </div>
  `,
  styles: `
    .chat-input {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .text-input {
      width: 100%;
      min-height: 96px;
      padding: 12px;
      border-radius: 12px;
      background: #fff;
      border: 1px solid var(--gray-light, rgba(164, 163, 161, 0.4));
      color: var(--gray-dark, rgba(61, 60, 58, 1));
      font-size: 14px;
      line-height: 1.5;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    .text-input:focus-visible {
      border-color: var(--sunshine-yellow, rgba(251, 187, 82, 1));
      box-shadow: 0 0 0 3px rgba(251, 187, 82, 0.2);
    }

    .text-input:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .action {
      align-self: flex-end;
      padding: 10px 16px;
      border-radius: 10px;
      background: var(--sunshine-yellow, rgba(251, 187, 82, 1));
      color: var(--gray-dark, rgba(61, 60, 58, 1));
      font-weight: 600;
      letter-spacing: 0.01em;
      transition:
        transform 0.12s ease,
        box-shadow 0.12s ease,
        opacity 0.12s ease;
    }

    .action:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(251, 187, 82, 0.22);
    }

    .action:active {
      transform: translateY(0);
      box-shadow: none;
    }
  `,
})
export class ChatInputComponent {
  readonly placeholder = input('Ask the pilot agent...');
  readonly isRunning = input(false);
  readonly submitted = output<string>();
  readonly stopped = output<void>();

  protected readonly userQuery = signal('');

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.isRunning()) {
        this.onStop();
      } else {
        this.onSubmit();
      }
    }
  }

  protected onSubmit(): void {
    if (this.isRunning()) {
      return;
    }
    const value = this.userQuery().trim();
    if (!value) {
      return;
    }
    this.submitted.emit(value);
    this.userQuery.set('');
  }

  protected onStop(): void {
    this.stopped.emit();
  }
}
