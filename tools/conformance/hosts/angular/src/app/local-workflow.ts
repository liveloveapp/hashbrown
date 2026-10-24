import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { chatResource, createTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Opt-in real framework tool workflow; permission decisions belong to the application. */
@Component({
  selector: 'runtime-local-workflow',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section>
    <input data-testid="prompt" [value]="prompt()" (input)="input($event)" />
    <button data-testid="send" type="button" (click)="send()">Send</button>
    <button data-testid="stop" type="button" (click)="chat.stop()">Stop</button>
    <p>Application-owned tool permission</p>
    <button
      data-testid="permission-allow"
      type="button"
      [disabled]="!snapshot().pending"
      (click)="workflow.decide(true)"
    >
      Allow
    </button>
    <button
      data-testid="permission-deny"
      type="button"
      [disabled]="!snapshot().pending"
      (click)="workflow.decide(false)"
    >
      Deny
    </button>
    <div data-testid="permission-pending">{{ snapshot().pending }}</div>
    <div data-testid="operation-count">{{ snapshot().operations.length }}</div>
    <div data-testid="operations">{{ operations() }}</div>
    <div data-testid="status">{{ chat.isLoading() ? 'loading' : 'idle' }}</div>
    <div data-testid="assistant">
      {{ chat.lastAssistantMessage()?.content ?? '' }}
    </div>
    <div data-testid="error">{{ error() }}</div>
  </section>`,
})
export class LocalWorkflow {
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
      'Look up the exact secret token for alpha or beta. Never guess.',
    schema: s.object('Secret lookup', {
      record: s.enumeration('Record', {
        alpha: 'Alpha record',
        beta: 'Beta record',
      }),
    }),
    handler: this.workflow.lookup,
  });
  private readonly follow = createTool({
    name: 'follow_secret',
    description: 'Use the exact lookup_secret token to obtain a receipt.',
    schema: s.object('Dependent lookup', {
      token: s.string('The exact token returned by lookup_secret'),
    }),
    handler: this.workflow.follow,
  });
  private readonly protectedLookup = createTool({
    name: 'protected_lookup',
    description:
      'Look up a secret after the application asks for permission. If denied, do not retry.',
    schema: s.object('Protected lookup', {
      record: s.enumeration('Record', {
        alpha: 'Alpha record',
        beta: 'Beta record',
      }),
    }),
    handler: this.workflow.protectedLookup,
  });
  protected readonly chat = chatResource({
    system:
      'Execute the requested workflow using tools. Return only actual tool results; never guess secret tokens or receipts. Do not retry denied operations.',
    tools: [this.lookup, this.follow, this.protectedLookup],
  });
  protected operations(): string {
    return JSON.stringify(this.snapshot().operations);
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
