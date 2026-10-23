import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  chatResource,
  createUiKit,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { WelcomeCard } from './welcome-card';

/** The independently selectable client workflow examples. */
export type WorkflowDemoMode =
  'interrupts' | 'shared-state' | 'activities' | 'ui-kits';

/** Renders a status card offered by the application. */
@Component({
  selector: 'app-status-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article aria-label="Status card">
    <h2>{{ title() }}</h2>
    <p>{{ message() }}</p>
  </article>`,
})
export class StatusCard {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}

const kit = createUiKit({
  components: [
    exposeComponent(WelcomeCard, {
      name: 'WelcomeCard',
      description: 'Welcome a traveler to their destination.',
      input: {
        title: s.string('A short title'),
        message: s.string('A short welcome'),
      },
      children: false,
    }),
    exposeComponent(StatusCard, {
      name: 'StatusCard',
      description: 'Summarize the status of an itinerary.',
      input: {
        title: s.string('A short status title'),
        message: s.string('The itinerary status'),
      },
      children: false,
    }),
  ],
});

/** Demonstrates text, interrupt, state, and activity APIs through one real runtime. */
@Component({
  selector: 'app-text-workflow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>{{ headings[mode()] }}</h1>
      @if (mode() === 'shared-state') {
        <label for="destination">Destination</label>
        <input
          id="destination"
          #destination
          [value]="chat.state()?.destination ?? ''"
          [disabled]="chat.isLoading()"
          (input)="editDestination(destination.value)"
        />
        <p>
          Agent state: <strong>{{ chat.state()?.status }}</strong>
        </p>
      }
      <button
        type="button"
        [disabled]="chat.isLoading() || !!chat.pendingInterrupts()"
        (click)="generate()"
      >
        {{
          mode() === 'interrupts'
            ? 'Plan a trip'
            : mode() === 'activities'
              ? 'Build an itinerary'
              : 'Ask the agent to plan'
        }}
      </button>
      @if (chat.isLoading()) {
        <p role="status">
          {{
            chat.isResuming()
              ? 'Resuming your trip...'
              : 'Working on your trip...'
          }}
        </p>
      }
      @if (chat.error()) {
        <p role="alert">The request failed. Try again.</p>
      } @else {
        @for (message of chat.value(); track $index) {
          @if (message.role === 'assistant') {
            <p>{{ message.content }}</p>
          }
          @if (
            message.role === 'activity' &&
            message.activityType === 'trip-progress'
          ) {
            @if (readProgress(message.content); as progress) {
              <article aria-label="Itinerary progress">
                <h2>{{ progress.label }}</h2>
                <progress
                  aria-label="Completed itinerary steps"
                  [max]="progress.total"
                  [value]="progress.completed"
                ></progress>
                <p>
                  {{ progress.completed }} of {{ progress.total }} steps
                  complete
                </p>
              </article>
            }
          }
        }
      }
      @if (chat.pendingInterrupts(); as batch) {
        <article aria-label="Approval required">
          <h2>Review your trip</h2>
          <ul>
            @for (interrupt of batch.interrupts; track interrupt.id) {
              <li>{{ interrupt.message ?? interrupt.reason }}</li>
            }
          </ul>
          <button
            type="button"
            [disabled]="chat.isResuming()"
            (click)="answerBatch(true)"
          >
            Approve and resume
          </button>
          <button
            type="button"
            [disabled]="chat.isResuming()"
            (click)="answerBatch(false)"
          >
            Decline trip
          </button>
        </article>
      }
    </main>
  `,
})
export class TextWorkflow {
  readonly mode = input.required<Exclude<WorkflowDemoMode, 'ui-kits'>>();
  protected readonly headings = {
    interrupts: 'Pause, approve, and resume',
    'shared-state': 'Edit shared agent state',
    activities: 'Follow the work as it happens',
  };
  protected readonly chat = chatResource({
    system: 'Help plan a trip to Lisbon.',
    state: { destination: 'Lisbon', status: 'Draft' },
  });

  protected editDestination(destination: string): void {
    this.chat.setState({ destination, status: 'Draft' });
  }

  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content:
        this.mode() === 'activities'
          ? 'Build a three-day itinerary.'
          : 'Plan my trip.',
    });
  }

  protected answerBatch(approved: boolean): void {
    const batch = this.chat.pendingInterrupts();
    if (!batch) return;
    this.chat.resume({
      batchId: batch.id,
      entries: batch.interrupts.map((interrupt) =>
        approved
          ? {
              interruptId: interrupt.id,
              status: 'resolved' as const,
              payload: true,
            }
          : { interruptId: interrupt.id, status: 'cancelled' as const },
      ),
    });
  }

  /** Validates display-only activity content before using it in the interface. */
  protected readProgress(content: unknown) {
    if (!content || typeof content !== 'object') return undefined;
    if (
      !('completed' in content) ||
      !('total' in content) ||
      !('label' in content)
    )
      return undefined;
    const { completed, total, label } = content;
    return typeof completed === 'number' &&
      Number.isFinite(completed) &&
      typeof total === 'number' &&
      Number.isFinite(total) &&
      total > 0 &&
      completed >= 0 &&
      completed <= total &&
      typeof label === 'string'
      ? { completed, total, label }
      : undefined;
  }
}

/** Composes trusted components into a kit used by the real UI chat schema. */
@Component({
  selector: 'app-kit-workflow',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Generate UI from a trusted kit</h1>
      <p>
        The kit exposes WelcomeCard and StatusCard with validated title and
        message props.
      </p>
      <label for="card">Card to generate</label>
      <select
        id="card"
        #choice
        [value]="card()"
        [disabled]="chat.isLoading()"
        (change)="card.set(choice.value)"
      >
        <option value="welcome">Welcome card</option>
        <option value="status">Status card</option>
      </select>
      <button type="button" [disabled]="chat.isLoading()" (click)="generate()">
        Generate a card
      </button>
      @if (chat.isLoading()) {
        <p role="status">Generating a trusted component...</p>
      }
      @if (chat.error()) {
        <p role="alert">The request failed. Try again.</p>
      } @else {
        @for (message of chat.value(); track $index) {
          @if (message.role === 'assistant') {
            <hb-render-message [message]="message" />
          }
        }
      }
    </main>
  `,
})
export class KitWorkflow {
  protected readonly card = signal('welcome');
  protected readonly chat = uiChatResource({
    system: 'Use the requested card from the provided UI kit.',
    components: [kit],
  });

  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content: `Generate a ${this.card()} card`,
    });
  }
}

/** Runs a checked client workflow selected by the recording URL. */
@Component({
  selector: 'app-workflows',
  imports: [TextWorkflow, KitWorkflow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (mode === 'ui-kits') {
      <app-kit-workflow />
    } @else {
      <app-text-workflow [mode]="mode" />
    }`,
})
export class Workflows {
  protected readonly mode = (new URLSearchParams(location.search).get('mode') ??
    'interrupts') as WorkflowDemoMode;
}
