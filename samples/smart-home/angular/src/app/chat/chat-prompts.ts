import { Component, output } from '@angular/core';

@Component({
  selector: 'app-chat-prompts',
  template: `
    @for (prompt of prompts; track prompt) {
      <button (click)="selectPrompt.emit(prompt)">"{{ prompt }}"</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      position: absolute;
      bottom: 0px;
      left: 0;
      align-items: flex-start;
    }

    button {
      text-align: left;
      background: #fff;
      border: 1px solid #fde4ba;
      border-radius: 8px;
      cursor: pointer;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      flex-grow: 0;
      width: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
    }
  `,
})
export class ChatPrompts {
  readonly selectPrompt = output<string>();
  readonly prompts = [
    'What are the lights in the living room?',
    'Turn off the living room lights',
    'Apply the bedroom off scene',
  ];
}
