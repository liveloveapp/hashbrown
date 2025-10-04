```ts
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-composer',
  template: `
    <textarea
      class="chat-composer"
      [placeholder]="placeholder()"
      (keydown.enter)="onHitEnter(textarea, $event)"
      #textarea
    ></textarea>
    <button class="send-button" (click)="onSendMessage(textarea)">Send</button>
  `,
})
export class ComposerComponent {
  sendMessage = output<string>();
  placeholder = input<string>('Show me all lights');

  onHitEnter(textarea: HTMLTextAreaElement, $event: Event) {
    $event.preventDefault();

    if (($event as KeyboardEvent).shiftKey) {
      textarea.value += '\n';
    } else {
      this.onSendMessage(textarea);
    }
  }

  onSendMessage(textarea: HTMLTextAreaElement) {
    this.sendMessage.emit(textarea.value);

    textarea.value = '';
  }
}
```
