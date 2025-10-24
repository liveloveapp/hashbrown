import { Component, signal } from '@angular/core';
import { createLens, structuredChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-lens',
  imports: [JsonPipe],
  template: `
    <h1>Lens Demo</h1>
    <button (click)="value.set(1)">Write 1</button>
    <button (click)="value.set(2)">Write 2</button>
    <button (click)="value.set(3)">Write 3</button>
    <p>Value: {{ value() }}</p>
    <form (submit)="sendMessage($event, input.value)">
      <input type="text" name="message" #input />
      <button type="submit">Send</button>
    </form>
    <pre>
      {{ chat.lastAssistantMessage() | json }}
    </pre
    >
  `,
})
export class LensComponent {
  value = signal(0);
  lens = createLens({
    name: 'lens',
    description: 'A lens',
    schema: s.number('The value'),
    read: () => this.value(),
    write: (value) => this.value.set(value),
  });
  chat = structuredChatResource({
    model: 'gpt-5',
    debugName: 'lens-demo',
    system: 'You are a helpful assistant that can read and write to a lens.',
    schema: s.object('Result', {
      response: s.string('Your response'),
    }),
    lenses: [this.lens],
  });

  sendMessage(event: Event, message: string) {
    event.preventDefault();
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
