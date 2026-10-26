import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import {
  applyLightProposal,
  canApplyLightProposal,
  initialLightState,
  type LightAuthorization,
  lightChatStatus,
  lightChatSystem,
  lightMessageOrigins,
  type ProposalOrigin,
  readLights,
} from '../../../runtime/light-chatbot';

/** Owns the simulated lights, conversation, and application authorization. */
@Injectable({ providedIn: 'root' })
export class LightChatSession {
  readonly lights = signal(initialLightState());
  readonly turn = signal(0);
  readonly cancelled = signal(false);
  readonly requests = signal<Readonly<Record<string, ProposalOrigin>>>({});
  readonly chat = uiChatResource({
    system: lightChatSystem,
    components,
    tools: [
      createTool({
        name: 'readLights',
        description:
          'Read the current simulated lights and their revision. Does not change any light.',
        handler: async () => readLights(this.lights()),
      }),
    ],
  });
  private readonly history = signal<ReturnType<typeof this.chat.value>>([]);
  readonly messages = computed(() =>
    this.chat.error() ? this.history() : this.chat.value(),
  );
  readonly origins = computed(() =>
    lightMessageOrigins(this.messages(), this.requests()),
  );
  readonly authorization = computed<LightAuthorization>(() => ({
    turn: this.turn(),
    cancelled: this.cancelled(),
    settled: !this.chat.isLoading(),
    error: !!this.chat.error(),
    interrupted: !!this.chat.pendingInterrupts(),
    finishReason: this.chat.lastRunFinishReason(),
  }));
  readonly status = computed(() => lightChatStatus(this.authorization()));

  /** Captures origin before starting a request; a newer turn invalidates old cards. */
  send(prompt: string): void {
    if (!prompt.trim()) return;
    if (this.chat.isLoading()) this.chat.stop();
    const turn = this.turn() + 1;
    const id = `light-turn-${turn}`;
    this.history.set([
      ...this.messages(),
      { id, role: 'user', content: prompt.trim() },
    ]);
    this.turn.set(turn);
    this.cancelled.set(false);
    this.requests.update((requests) => ({
      ...requests,
      [id]: { turn, revision: this.lights().revision },
    }));
    this.chat.sendMessage({ id, role: 'user', content: prompt.trim() });
  }

  /** Cancels the current turn before stopping the runtime. */
  stop(): void {
    this.cancelled.set(true);
    this.chat.stop();
  }
}

/** Supplies application-owned message origin to generated components. */
@Component({
  selector: 'app-light-answer',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hb-render-message [message]="message()" />`,
})
export class LightAnswer {
  readonly message =
    input.required<
      NonNullable<ReturnType<LightChatSession['chat']['lastAssistantMessage']>>
    >();
  readonly origin = input.required<ProposalOrigin>();
}

/** Displays a proposal; only the user's click can change local application state. */
@Component({
  selector: 'app-light-proposal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article aria-label="Light proposal">
      <h2>Proposed brightness</h2>
      <p>{{ lightId() }}: {{ brightness() }}%</p>
      <button type="button" [disabled]="!allowed()" (click)="apply()">
        Apply brightness
      </button>
      <p data-testid="proposal-status">
        {{
          used()
            ? 'Applied.'
            : allowed()
              ? 'Ready to apply.'
              : 'Unavailable for this run.'
        }}
      </p>
    </article>
  `,
})
export class LightProposal {
  readonly lightId = input.required<string>();
  readonly brightness = input.required<number>();
  private readonly session = inject(LightChatSession);
  private readonly origin = inject(LightAnswer).origin();
  protected readonly used = signal(false);
  protected readonly allowed = computed(() =>
    canApplyLightProposal(
      this.session.lights(),
      this.origin,
      { lightId: this.lightId(), brightness: this.brightness() },
      this.session.authorization(),
      this.used(),
    ),
  );

  protected apply(): void {
    const current = this.session.lights();
    const next = applyLightProposal(
      current,
      this.origin,
      { lightId: this.lightId(), brightness: this.brightness() },
      this.session.authorization(),
      this.used(),
    );
    if (next === current) return;
    this.session.lights.set(next);
    this.used.set(true);
  }
}

/** Displays a tool-informed reading without offering an action. */
@Component({
  selector: 'app-light-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<article aria-label="Light reading">
    <h2>Reported brightness</h2>
    <p data-testid="light-reading">{{ text() }}</p>
  </article>`,
})
export class LightReading {
  readonly lightId = input.required<string>();
  readonly brightness = input.required<number>();
  private readonly session = inject(LightChatSession);
  protected readonly text = computed(() => {
    const light = this.session
      .lights()
      .lights.find((item) => item.id === this.lightId());
    const brightness = this.brightness();
    return light &&
      Number.isInteger(brightness) &&
      brightness >= 0 &&
      brightness <= 100
      ? `${light.name}: ${brightness}%`
      : 'Invalid light reading.';
  });
}
const inputSchema = {
  lightId: s.string('The light id returned by readLights'),
  brightness: s.number('Integer brightness from 0 to 100'),
};
const components = [
  exposeComponent(LightProposal, {
    name: 'LightProposal',
    description:
      'Propose a brightness change for the user to review and apply.',
    input: inputSchema,
    children: false,
  }),
  exposeComponent(LightReading, {
    name: 'LightReading',
    description:
      'Show the current brightness returned by readLights. Read-only.',
    input: inputSchema,
    children: false,
  }),
];

/** A tool-assisted conversation with explicit, revision-checked local changes. */
@Component({
  selector: 'app-light-chatbot',
  imports: [LightAnswer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>A conversation about one light</h1>
      <p>
        Simulated Desk light:
        <strong data-testid="light-brightness"
          >{{ session.lights().lights[0].brightness }}%</strong
        >
        · revision
        <span data-testid="light-revision">{{
          session.lights().revision
        }}</span>
      </p>
      <form (submit)="$event.preventDefault(); send()">
        <label for="light-message">Your message</label>
        <textarea
          id="light-message"
          [value]="prompt()"
          (input)="prompt.set($any($event.target).value)"
        ></textarea>
        <button type="submit" [disabled]="!prompt().trim()">Send</button>
        <button
          type="button"
          [disabled]="!session.chat.isLoading()"
          (click)="session.stop()"
        >
          Stop
        </button>
      </form>
      <p role="status" data-testid="chat-status">{{ session.status() }}</p>
      <ol aria-label="Conversation">
        @for (
          message of session.messages();
          track message.role === 'error' ? 'error-' + $index : message.id
        ) {
          <li>
            @if (message.role === 'user') {
              <p>You: {{ message.content }}</p>
            } @else if (message.role === 'assistant') {
              <app-light-answer
                [message]="message"
                [origin]="session.origins()[message.id] ?? unknownOrigin"
              />
            }
          </li>
        }
      </ol>
    </main>
  `,
})
export class LightChatbot {
  protected readonly session = inject(LightChatSession);
  protected readonly prompt = signal('Set the desk light to 40%.');
  protected readonly unknownOrigin: ProposalOrigin = { turn: -1, revision: -1 };

  protected send(): void {
    if (!this.prompt().trim()) return;
    this.session.send(this.prompt());
    this.prompt.set('');
  }
}
