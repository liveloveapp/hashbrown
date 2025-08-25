```ts
import { Component, input } from '@angular/core';
import { Chat } from '@hashbrownai/core';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-messages',
  imports: [MarkdownComponent],
  template: `
    @for (message of messages(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <div class="chat-message user">
            <p>{{ message.content }}</p>
          </div>
        }
        @case ('assistant') {
          <markdown [data]="'' + message.content" />
        }
      }
    }
  `,
})
export class SimpleMessagesComponent {
  messages = input.required<Chat.AnyMessage[]>();
}
```
