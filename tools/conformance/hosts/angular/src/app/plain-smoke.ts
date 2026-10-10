import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { chatResource, createTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { InterruptControls } from './interrupt-controls';

function isToolScenario(): boolean {
  return (
    new URL(globalThis.location.href).searchParams.get('scenario') === 'tool'
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** Plain Angular chat fixture used by the shared runtime smoke scenarios. */
@Component({
  selector: 'runtime-plain-smoke',
  standalone: true,
  imports: [InterruptControls],
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
      <runtime-interrupt-controls
        [batch]="chat.pendingInterrupts()"
        [isResuming]="chat.isResuming()"
        [resume]="chat.resume"
      />
      <button data-testid="new-thread" type="button" (click)="newThread()">
        New thread
      </button>
      <div data-testid="shared-state">{{ sharedState() }}</div>
      <div data-testid="command-error">{{ commandError() }}</div>
      <div
        data-testid="status"
        [textContent]="chat.isLoading() ? 'loading' : 'idle'"
      ></div>
      <div data-testid="user-message" [textContent]="submitted()"></div>
      <div
        data-testid="assistant"
        [textContent]="chat.lastAssistantMessage()?.content ?? ''"
      ></div>
      <div data-testid="error" [textContent]="toErrorText(chat.error())"></div>
      <div
        data-testid="sending-error"
        [textContent]="toErrorText(chat.sendingError())"
      ></div>
      <div
        data-testid="generating-error"
        [textContent]="toErrorText(chat.generatingError())"
      ></div>
      <div data-testid="tool-count">{{ toolCount() }}</div>
      <div data-testid="reasoning" [textContent]="reasoningText()"></div>
      <div
        data-testid="reasoning-detail-count"
        [textContent]="reasoningDetails().length"
      ></div>
      <div
        data-testid="reasoning-has-opaque-value"
        [textContent]="reasoningHasOpaqueValue() ? 'true' : 'false'"
      ></div>
    </section>
  `,
})
export class PlainSmoke {
  protected readonly prompt = signal('');
  private readonly threadId = signal(crypto.randomUUID());
  protected readonly commandError = signal('');
  protected readonly submitted = signal('');
  protected readonly toolCount = signal(0);
  protected readonly toErrorText = errorText;

  private readonly getWeather = createTool({
    name: 'getWeather',
    description: 'Get the current weather for a city.',
    schema: s.object('Weather lookup', {
      city: s.string('The city to get weather for'),
    }),
    handler: async ({ city }) => {
      this.toolCount.update((count) => count + 1);

      return { city, temperatureC: 21, condition: 'sunny' };
    },
  });

  protected readonly chat = chatResource({
    system: 'Runtime smoke system prompt.',
    threadId: this.threadId,
    tools: isToolScenario() ? [this.getWeather] : [],
  });
  protected readonly sharedState = computed(() =>
    JSON.stringify(this.chat.state()),
  );
  protected readonly reasoningDetails = computed(() => {
    const snapshot = this.chat.snapshot();
    if (snapshot.status === 'error') {
      return [];
    }

    const message = [...snapshot.value]
      .reverse()
      .find(
        (candidate) =>
          candidate.role === 'assistant' &&
          candidate.reasoningDetails !== undefined,
      );

    return message?.role === 'assistant'
      ? (message.reasoningDetails ?? [])
      : [];
  });
  protected readonly reasoningText = computed(() =>
    this.reasoningDetails()
      .map((detail) => detail.content)
      .filter((content) => content.length > 0)
      .join('\n\n'),
  );
  protected readonly reasoningHasOpaqueValue = computed(() =>
    this.reasoningDetails().some((detail) => Boolean(detail.encryptedValue)),
  );

  protected newThread(): void {
    this.threadId.set(crypto.randomUUID());
  }

  protected onPromptInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }

  protected send(): void {
    const content = this.prompt();
    this.submitted.set(content);
    this.commandError.set('');
    try {
      this.chat.sendMessage({ role: 'user', content });
    } catch (cause) {
      this.commandError.set(errorText(cause));
    }
  }
}
