import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import {
  type JsonResolvedValue,
  s,
  type UiComponentDefinition,
} from '@hashbrownai/core';
import { createWorkflow, type WorkflowSnapshot } from './workflow';

/** Trusted leaf contract for this local native UI workflow host. */
const workflowStatusDefinition = {
  name: 'status',
  description: 'Display a runtime status.',
  props: {
    title: s.streaming.string('Status title'),
    count: s.number('Status count'),
  },
  children: false,
} satisfies UiComponentDefinition;

/** Container contract; only status components are allowed as children. */
const workflowPanelDefinition = {
  name: 'panel',
  description: 'Group a status inside a panel.',
  props: { heading: s.string('Panel heading') },
  children: [workflowStatusDefinition],
} satisfies UiComponentDefinition;

/** Trusted leaf with schema-validated title and count inputs. */
@Component({
  selector: 'runtime-ui-leaf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section data-testid="ui-leaf">
    <span data-testid="ui-value">{{ title() }}</span
    ><span data-testid="ui-count">{{ count() }}</span>
  </section>`,
})
class RuntimeStatusComponent {
  readonly title = input.required<string>();
  readonly count = input.required<number>();
}
/** Displays streaming props before the leaf schema is complete. */
@Component({
  selector: 'runtime-ui-fallback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span data-testid="ui-fallback">{{ title() }}</span>`,
})
class RuntimeStatusFallbackComponent {
  readonly partialProps = input.required<Record<string, JsonResolvedValue>>();
  protected readonly title = computed(() => this.partialProps()['title'] ?? '');
}
/** Bounded container for trusted status children. */
@Component({
  selector: 'runtime-ui-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section data-testid="ui-panel">
    <h2>{{ heading() }}</h2>
    <ng-content />
  </section>`,
})
class RuntimePanelComponent {
  readonly heading = input.required<string>();
}

const statusComponent = exposeComponent(RuntimeStatusComponent, {
  ...workflowStatusDefinition,
  input: workflowStatusDefinition.props,
  fallback: RuntimeStatusFallbackComponent,
});
const panelComponent = exposeComponent(RuntimePanelComponent, {
  ...workflowPanelDefinition,
  input: workflowPanelDefinition.props,
  children: [statusComponent],
});

/** Exercises native tools and trusted component UI through the real Angular runtime. */
@Component({
  selector: 'runtime-local-ui-workflow',
  standalone: true,
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section>
    <input data-testid="prompt" [value]="prompt()" (input)="input($event)" />
    <button data-testid="send" type="button" (click)="send()">Send</button>
    <button data-testid="stop" type="button" (click)="chat.stop()">Stop</button>
    <div data-testid="operation-count">{{ snapshot().operations.length }}</div>
    <div data-testid="operations">{{ operations() }}</div>
    <div data-testid="status">{{ chat.isLoading() ? 'loading' : 'idle' }}</div>
    @for (message of visibleMessages(); track $index) {
      @if (message.role === 'assistant') {
        <hb-render-message [message]="message" />
      }
    }
    <div data-testid="history">{{ history() }}</div>
    <div data-testid="error">{{ error() }}</div>
  </section>`,
})
export class LocalUiWorkflow {
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
  protected readonly chat = uiChatResource({
    system:
      'Complete requested lookup_secret and follow_secret steps before rendering UI. Never guess unknown tokens or receipts. Render status components using the exact requested token or receipt as title and requested count. A panel may contain only status children. Without tools render the requested literal title.',
    components: [statusComponent, panelComponent],
    tools:
      new URL(globalThis.location.href).searchParams.get('noTools') === 'true'
        ? []
        : [this.lookup, this.follow],
  });
  protected readonly visibleMessages = computed(() =>
    this.chat.status() === 'error' ? [] : this.chat.value(),
  );
  protected operations(): string {
    return JSON.stringify(this.snapshot().operations);
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
