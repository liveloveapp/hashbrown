import {
  Component,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Chat } from '@hashbrownai/core';
import { chatResource, ChatResourceRef } from '@hashbrownai/angular';

@Component({
  selector: 'app-project-chat',
  template: `
    <input
      type="text"
      [value]="input()"
      #inputRef
      (input)="input.set(inputRef.value)"
    />
    <button (click)="chat?.sendMessage({ role: 'user', content: input() })">
      Send
    </button>

    @for (message of chat?.value(); track $index) {
      <div>{{ message.content }}</div>
    }
  `,
})
export class ProjectChatComponent {
  tools = input.required<Chat.AnyTool[]>();
  input = signal('');
  chat: ChatResourceRef<Chat.AnyTool> | null = null;
  injector = inject(Injector);

  ngOnInit() {
    console.log(this.tools());
    this.chat = runInInjectionContext(this.injector, () =>
      chatResource({
        model: 'gpt-4.1',
        tools: this.tools(),
        system: 'You are a helpful assistant that can help with projects.',
      }),
    );
  }
}
