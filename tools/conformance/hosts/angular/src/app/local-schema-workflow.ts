import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { createTool, structuredChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Exercises native tools and parsed schema output through the real Angular runtime. */
@Component({
  selector: 'runtime-local-schema-workflow',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section>
    <input data-testid="prompt" [value]="prompt()" (input)="input($event)" />
    <button data-testid="send" type="button" (click)="send()">Send</button>
    <button data-testid="stop" type="button" (click)="chat.stop()">Stop</button>
    <div data-testid="operation-count">{{ snapshot().operations.length }}</div>
    <div data-testid="operations">{{ operations() }}</div>
    <div data-testid="status">{{ chat.isLoading() ? 'loading' : 'idle' }}</div>
    <div data-testid="assistant">{{ answer() }}</div>
    <div data-testid="history">{{ history() }}</div>
    <div data-testid="error">{{ error() }}</div>
  </section>`,
})
export class LocalSchemaWorkflow {
  protected readonly prompt = signal('');
  protected readonly snapshot = signal<WorkflowSnapshot>({
    operations: [],
    pending: false,
  });
  protected readonly workflow = createWorkflow((snapshot) =>
    this.snapshot.set(snapshot),
  );
  private readonly lookup = createTool({
    name: 'lookup_secret',
    description:
      'Look up the exact unknown secret token for alpha. Never guess it.',
    schema: s.object('Lookup', { record: s.string('Record identifier') }),
    handler: this.workflow.lookup,
  });
  private readonly follow = createTool({
    name: 'follow_secret',
    description: 'Use the exact token from lookup_secret to obtain a receipt.',
    schema: s.object('Dependent lookup', {
      token: s.string('Exact lookup token'),
    }),
    handler: this.workflow.follow,
  });
  protected readonly chat = structuredChatResource({
    system:
      'Follow the requested workflow. Obtain unknown tokens and receipts using tools; never guess. Complete all requested tool steps before answering. Return only a JSON object with a value property containing the exact requested token or receipt.',
    schema: s.object('Final answer', {
      value: s.string('Exact requested tool result'),
    }),
    tools: [this.lookup, this.follow],
  });
  protected operations(): string {
    return JSON.stringify(this.snapshot().operations);
  }
  protected answer(): string {
    const message = this.chat.lastAssistantMessage();
    return message?.content ? JSON.stringify(message.content) : '';
  }
  protected history(): string {
    return JSON.stringify(this.chat.hasValue() ? this.chat.value() : []);
  }
  protected error(): string {
    const error = this.chat.error();
    return error instanceof Error
      ? error.message
      : error === undefined
        ? ''
        : String(error);
  }
  protected input(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }
  protected send(): void {
    this.chat.sendMessage({ role: 'user', content: this.prompt() });
  }
}
