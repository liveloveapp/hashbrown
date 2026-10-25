---
title: 'Build a Light Chatbot: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Build a small generative UI conversation with a browser read tool, trusted components, and an explicit Apply action for simulated local state.'
---

# Build a conversation about one light

Let's ask a chatbot to dim a Desk light. The light starts at 80%. The assistant reads its current value and proposes 40%. Our component shows an **Apply brightness** button. Only clicking that button changes the light.

<hb-docs-demo demo="ui-chatbot-angular">
</hb-docs-demo>

The recording runs the checked Angular component below. A deterministic transport fixture supplies the assistant events; no real device or live model is used in the recording. The browser tool handler, tool-result continuation, Hashbrown rendering, and local Apply action are real. Running the Quickstart endpoint yourself calls your configured provider.

<img src="/video/docs/ui-chatbot-angular-result.png" alt="The applied light proposal and a follow-up reading both show the simulated Desk light at 40%, revision 1." width="980" height="602" loading="lazy" />

## Before we start

Start with the [Angular Quickstart](/docs/angular/start/quick), including its `/api/chat` endpoint and development proxy. Keep the existing `@hashbrownai/core` and `@hashbrownai/angular` packages. This task needs no additional package. Your provider must support structured output and tool calling; keep its API key on the server.

The complete sources below use this folder layout. The `runtime` directory sits beside the frontend directory, not inside `src`. This keeps the checked relative imports working:

```text
light-example/
  runtime/
    light-chatbot.ts
  angular/
    src/
      app/light-chatbot.ts
```

Copy `light-chatbot.ts` into `angular/src/app/`. Replace the Quickstart's `src/app/app.ts` with this host:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LightChatbot } from './light-chatbot';

@Component({
  selector: 'app-root',
  imports: [LightChatbot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-light-chatbot />',
})
export class App {}
```

Keep the existing `bootstrapApplication(App, appConfig)` in `src/main.ts` and `provideHashbrown({ baseUrl: '/api/chat' })` in `app.config.ts`.

If your frontend keeps all TypeScript under `src`, move `runtime/light-chatbot.ts` there and adjust the client's shared import. The server stays where the Quickstart put it. Start both processes with the Quickstart's existing commands. The component starts idle; it sends nothing until you select **Send**. The recording adds presentation styles around this same component.

## Try the conversation

1. Send **Set the desk light to 40%.** The state display still reads 80% while the proposal streams.
2. Wait for **Reply complete**. Review the proposal, then select **Apply brightness**. The application now displays 40%, revision 1. The card reads Applied and cannot run again.
3. Send **What is the desk light set to now?** The browser tool reads revision 1. The assistant renders a read-only `LightReading` showing 40%.

The state display above the conversation comes directly from the application. The assistant's reading is a report based on the tool response. Neither a reading nor a proposal changes the light automatically.

## Read state through a browser tool

`readLights` returns a snapshot with a revision and one known light:

```json
{
  "revision": 0,
  "lights": [{ "id": "desk", "name": "Desk light", "brightness": 80 }]
}
```

The handler reads current application state each time the assistant calls it. Hashbrown sends that result in the next request so the assistant can choose a component using the returned data. After Apply, the next call returns revision 1 with brightness 40. The tool has no write operation.

The [`uiChatResource`](/api/angular/uiChatResource) configuration supplies this tool and two trusted components. `LightProposal` offers an action; `LightReading` displays a value. Both accept only `lightId` and `brightness` from the model. `children: false` keeps this example to two small leaf components.

## Keep permission in the application

Skillet validates the prop shapes with `s.string()` and `s.number()`. A numeric schema description does not enforce an integer or a range. `canApplyLightProposal` checks the known light ID, integer brightness from 0 through 100, and the current application conditions when the user clicks.

A proposal can apply only when its captured turn and light revision still match, the card is unused, and the current run has settled without error, cancellation, or interruption. The runtime must report `lastRunFinishReason` as `stop`. A tool-call finish, token-limit finish, absent finish reason, or failed response leaves Apply disabled.

`LightChatSession` owns the light signals and `uiChatResource`. The generated components inject this same service, so the tool, state display, and Apply action share one source of truth. `computed` derives authorization directly from the resource; there is no effect copying runtime status into another flag.

`LightAnswer` supplies the application-owned origin for one assistant message. `LightProposal` captures it once in a constructor field. The origin comes from the preceding user message, not from generated inputs. Before each Send, the service saves completed history and the new user message so a resource error can display that history without reading a throwing `value()` signal.

Every explicit Send gets a new application turn, including a retry of the same text. Stable message IDs preserve earlier user messages and assistant cards. A newer request immediately invalidates old proposals, including while it is waiting. Applying one proposal increments the revision and invalidates other cards that read the earlier state.

## Stop and retry

Select **Stop** during a request to cancel it. The application marks that turn cancelled before stopping the runtime, so a partial card or late response cannot enable Apply. The light retains its last applied value. To retry after a stop, error, or incomplete reply, enter the message again and select **Send**.

Try an unknown light or an out-of-range proposal while testing your own endpoint. Even if generated props reach a card, the application action rejects them. For a real device integration, put the corresponding authorization, concurrency check, and write validation at the server or device boundary as well; this example changes only browser memory and resets on reload.

## Complete source

The shared file holds the state rules. The client registers the tool, renders the conversation, and owns the explicit action. Copy both files.

<hb-expander title="Complete runtime/light-chatbot.ts">
<hb-code-example header="runtime/light-chatbot.ts">

```ts
import type { FinishReason } from '@hashbrownai/core';

/** A simulated, application-owned light. */
export interface Light {
  readonly id: string;
  readonly name: string;
  readonly brightness: number;
}
/** A revisioned snapshot of the simulated lights. */
export interface LightState {
  readonly revision: number;
  readonly lights: readonly Light[];
}
/** Model-proposed display values, never authorization. */
export interface LightProposalProps {
  readonly lightId: string;
  readonly brightness: number;
}
/** Application context captured once when a proposal mounts. */
export interface ProposalOrigin {
  readonly turn: number;
  readonly revision: number;
}
/** Current application and runtime conditions for a user-operated Apply. */
export interface LightAuthorization {
  readonly turn: number;
  readonly cancelled: boolean;
  readonly settled: boolean;
  readonly error: boolean;
  readonly interrupted: boolean;
  readonly finishReason: FinishReason | undefined;
}
/** Creates a fresh simulated Desk light at 80 percent. */
export function initialLightState(): LightState {
  return {
    revision: 0,
    lights: [{ id: 'desk', name: 'Desk light', brightness: 80 }],
  };
}
/** Returns an independent snapshot without changing application state. */
export function readLights(state: LightState): LightState {
  return {
    revision: state.revision,
    lights: state.lights.map((light) => ({ ...light })),
  };
}
/** Checks the current run and validates proposal values at the action boundary. */
export function canApplyLightProposal(
  state: LightState,
  origin: ProposalOrigin,
  proposal: LightProposalProps,
  authorization: LightAuthorization,
  used: boolean,
): boolean {
  return (
    !used &&
    !authorization.cancelled &&
    authorization.settled &&
    !authorization.error &&
    !authorization.interrupted &&
    authorization.finishReason === 'stop' &&
    origin.turn === authorization.turn &&
    origin.revision === state.revision &&
    state.lights.some((light) => light.id === proposal.lightId) &&
    Number.isInteger(proposal.brightness) &&
    proposal.brightness >= 0 &&
    proposal.brightness <= 100
  );
}
/** Applies once to the current revision, or returns the unchanged state. */
export function applyLightProposal(
  state: LightState,
  origin: ProposalOrigin,
  proposal: LightProposalProps,
  authorization: LightAuthorization,
  used: boolean,
): LightState {
  if (!canApplyLightProposal(state, origin, proposal, authorization, used))
    return state;
  return {
    revision: state.revision + 1,
    lights: state.lights.map((light) =>
      light.id === proposal.lightId
        ? { ...light, brightness: proposal.brightness }
        : light,
    ),
  };
}
/** Binds assistant history to the application origin of its preceding user message. */
export function lightMessageOrigins(
  messages: readonly { readonly id?: string; readonly role: string }[],
  requests: Readonly<Record<string, ProposalOrigin>>,
): Readonly<Partial<Record<string, ProposalOrigin>>> {
  let origin: ProposalOrigin | undefined;
  const result: Record<string, ProposalOrigin> = {};
  for (const message of messages) {
    if (message.role === 'user')
      origin = message.id ? requests[message.id] : undefined;
    if (message.role === 'assistant' && message.id && origin)
      result[message.id] = origin;
  }
  return result;
}

/** Instructions shared by the checked clients; the read tool never changes a light. */
export const lightChatSystem = `You help with one simulated Desk light. Always call readLights before answering each user message. For a brightness change, render one LightProposal with the known light id and requested brightness; the user must apply it. For a question about current brightness, render one read-only LightReading with the id and brightness returned by readLights. Never claim that a proposal has already changed a light.`;

/** Explains runtime outcomes without treating partial UI as permission to act. */
export function lightChatStatus(authorization: LightAuthorization): string {
  if (authorization.turn === 0) return 'Ready.';
  if (authorization.cancelled) return 'Stopped. Send a message to try again.';
  if (authorization.error)
    return 'The request failed. Send a message to try again.';
  if (!authorization.settled) return 'Waiting for a reply…';
  if (authorization.finishReason !== 'stop' || authorization.interrupted)
    return 'Reply incomplete. Send a message to try again.';
  return 'Reply complete. Review any proposal before applying.';
}
```

</hb-code-example>
</hb-expander>

<hb-expander title="Complete angular/src/app/light-chatbot.ts">
<hb-code-example header="angular/src/app/light-chatbot.ts">

```ts
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
```

</hb-code-example>
</hb-expander>

## Next steps

Use [tools](/docs/angular/concept/functions) to expose other small application reads. Keep actions explicit, validate their values at the boundary that owns the state, and use [Skillet](/docs/angular/concept/schema) to describe the components your assistant can render.
