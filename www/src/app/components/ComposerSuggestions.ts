import { Component, output, signal } from '@angular/core';

@Component({
  selector: 'www-composer-suggestions',
  template: `
    @for (suggestion of suggestions(); track $index) {
      <button (click)="onSuggestionClick(suggestion)">
        {{ suggestion }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 16px;
    }

    button {
      padding: 16px;
      border-radius: 24px;
      border: 1px solid rgba(61, 60, 58, 0.88);
      background-color: #fff;
      cursor: pointer;
    }
  `,
})
export class ComposerSuggestions {
  sendMessage = output<string>();

  suggestions = signal([
    'Show me all lights',
    'Turn on the living room light',
    'What is the average brightness?',
  ]);

  onSuggestionClick(suggestion: string) {
    this.sendMessage.emit(suggestion);
  }
}
