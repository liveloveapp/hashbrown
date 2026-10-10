import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { createTool, structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { InterruptControls } from './interrupt-controls';

const answerSchema = s.object('Runtime completion answer', {
  answer: s.streaming.string('Answer text'),
  count: s.number('Result count'),
});

/** Exercises reactive completion input across interruption and local tool execution. */
@Component({
  selector: 'runtime-completion-smoke',
  standalone: true,
  imports: [InterruptControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <input
        data-testid="completion-input"
        [value]="input()"
        (input)="onInput($event)"
      />
      <runtime-interrupt-controls
        [batch]="completion.pendingInterrupts()"
        [isResuming]="completion.isResuming()"
        [resume]="completion.resume"
      />
      <div data-testid="structured-answer">{{ answer() }}</div>
      <div data-testid="tool-count">{{ toolCount() }}</div>
      <div data-testid="error">{{ errorText() }}</div>
    </section>
  `,
})
export class CompletionSmoke {
  protected readonly input = signal('');
  protected readonly toolCount = signal(0);
  private readonly getWeather = createTool({
    name: 'getWeather',
    description: 'Get the current weather for a city.',
    schema: s.object('Weather lookup', { city: s.string('City') }),
    handler: async ({ city }) => {
      this.toolCount.update((count) => count + 1);
      return { city, temperatureC: 21 };
    },
  });
  protected readonly completion = structuredCompletionResource({
    input: this.input,
    system: 'Runtime smoke system prompt.',
    schema: answerSchema,
    tools: [this.getWeather],
    debounce: 0,
    retries: 0,
  });
  protected readonly answer = computed(() => {
    const snapshot = this.completion.snapshot();
    return snapshot.status === 'error' ? '' : (snapshot.value?.answer ?? '');
  });
  protected readonly errorText = computed(() => {
    const error = this.completion.error();
    return error instanceof Error
      ? error.message
      : error === undefined
        ? ''
        : String(error);
  });

  protected onInput(event: Event): void {
    this.input.set((event.currentTarget as HTMLInputElement).value);
  }
}
