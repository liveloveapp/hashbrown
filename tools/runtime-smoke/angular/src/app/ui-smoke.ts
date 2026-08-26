import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { type JsonResolvedValue, s } from '@hashbrownai/core';

@Component({
  selector: 'status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="status-card">{{ title() }}: {{ count() }}</div>`,
})
class RuntimeStatusComponent {
  readonly title = input.required<string>();
  readonly count = input.required<number>();
}

@Component({
  selector: 'runtime-status-fallback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="status-card" [textContent]="title()"></div>`,
})
class RuntimeStatusFallbackComponent {
  readonly partialProps = input.required<Record<string, JsonResolvedValue>>();
  protected readonly title = computed(() => {
    const title = this.partialProps()['title'];

    return typeof title === 'string' ? title : '';
  });
}

const components = [
  exposeComponent(RuntimeStatusComponent, {
    name: 'status',
    description: 'Display a runtime status.',
    fallback: RuntimeStatusFallbackComponent,
    input: {
      title: s.streaming.string('Status title'),
      count: s.number('Status count'),
    },
    children: false,
  }),
];

/** Angular generative UI fixture used by the shared runtime smoke scenario. */
@Component({
  selector: 'runtime-ui-smoke',
  standalone: true,
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <input
        data-testid="prompt"
        [value]="prompt()"
        (input)="onPromptInput($event)"
      />
      <button data-testid="send" type="button" (click)="send()">Send</button>
      <button data-testid="stop" type="button" (click)="chat.stop()">
        Stop
      </button>
      <div
        data-testid="status"
        [textContent]="chat.isLoading() ? 'loading' : 'idle'"
      ></div>
      <div data-testid="user-message" [textContent]="submitted()"></div>
      <div data-testid="assistant"></div>
      @for (message of assistantMessages(); track $index) {
        <hb-render-message [message]="message" />
      }
      <div data-testid="error" [textContent]="errorText()"></div>
      <div data-testid="sending-error"></div>
      <div data-testid="generating-error"></div>
      <div data-testid="tool-count">0</div>
      <div data-testid="structured-answer"></div>
      <div data-testid="structured-count"></div>
    </section>
  `,
})
export class UiSmoke {
  protected readonly prompt = signal('');
  protected readonly submitted = signal('');
  protected readonly chat = uiChatResource({
    model: 'gpt-4o',
    system: 'Runtime smoke system prompt.',
    components,
  });
  protected readonly assistantMessages = computed(() =>
    this.chat.status() === 'error'
      ? []
      : this.chat.value().filter((message) => message.role === 'assistant'),
  );
  protected readonly errorText = computed(() => {
    const error = this.chat.error();

    return error instanceof Error
      ? error.message
      : error === undefined
        ? ''
        : String(error);
  });

  protected onPromptInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }

  protected send(): void {
    const content = this.prompt();
    this.submitted.set(content);
    this.chat.sendMessage({ role: 'user', content });
  }
}
