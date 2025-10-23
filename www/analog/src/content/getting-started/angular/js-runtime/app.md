```ts
import {
  createToolJavaScript,
  RenderMessageComponent,
  structuredChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  template: `
    @if (chat.lastAssistantMessage()) {
      <hb-render-message [message]="chat.lastAssistantMessage()" />
    }
  `,
})
export class App {
  chart = inject(ChartRuntime);
  chat = structuredChatResource({
    model: 'gpt-5',
    system: `Build an interactive chart using chart.js `,
    tools: [
      createToolJavaScript({
        runtime: this.chart.runtime,
      }),
    ],
  });

  sendMessage(message: string): void {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```
