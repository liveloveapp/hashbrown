---
title: 'Build a Light Chatbot: Hashbrown React Docs'
meta:
  - name: description
    content: 'Build a small generative UI conversation with a browser read tool, trusted components, and an explicit Apply action for simulated local state.'
---

# Build a conversation about one light

Let's ask a chatbot to dim a Desk light. The light starts at 80%. The assistant reads its current value and proposes 40%. Our component shows an **Apply brightness** button. Only clicking that button changes the light.

<hb-docs-demo demo="ui-chatbot-react">
</hb-docs-demo>

The recording runs the checked React component below. A deterministic transport fixture supplies the assistant events; no real device or live model is used in the recording. The browser tool handler, tool-result continuation, Hashbrown rendering, and local Apply action are real. Running the Quickstart endpoint yourself calls your configured provider.

<img src="/video/docs/ui-chatbot-react-result.png" alt="The applied light proposal and a follow-up reading both show the simulated Desk light at 40%, revision 1." width="980" height="602" loading="lazy" />

## Before we start

Start with the [React Quickstart](/docs/react/start/quick), including its `/api/chat` endpoint and development proxy. Keep the existing `@hashbrownai/core` and `@hashbrownai/react` packages. This task needs no additional package. Your provider must support structured output and tool calling; keep its API key on the server.

The complete sources below use this folder layout. The `runtime` directory sits beside the frontend directory, not inside `src`. This keeps the checked relative imports working:

```text
light-example/
  runtime/
    light-chatbot.ts
  react/
    src/
      LightChatbot.tsx
```

Copy `LightChatbot.tsx` into `react/src/`. In the Quickstart's `src/main.tsx`, replace the `App` import with:

```tsx
import { LightChatbot as App } from './LightChatbot';
```

Keep the existing `createRoot` call and `<HashbrownProvider url="/api/chat">` around `<App />`.

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

The [`useUiChat`](/api/react/useUiChat) configuration supplies this tool and two trusted components. `LightProposal` offers an action; `LightReading` displays a value. Both accept only `lightId` and `brightness` from the model. `children: false` keeps this example to two small leaf components.

## Keep permission in the application

Skillet validates the prop shapes with `s.string()` and `s.number()`. A numeric schema description does not enforce an integer or a range. `canApplyLightProposal` checks the known light ID, integer brightness from 0 through 100, and the current application conditions when the user clicks.

A proposal can apply only when its captured turn and light revision still match, the card is unused, and the current run has settled without error, cancellation, or interruption. The runtime must report `lastRunFinishReason` as `stop`. A tool-call finish, token-limit finish, absent finish reason, or failed response leaves Apply disabled.

`LightChatbot` owns the light state and passes it through React context. Each assistant message receives its application-owned origin through a second context. `LightProposal` captures that origin with a `useState` initializer, so later renders cannot turn an old card into a new proposal.

The state updater checks the current light revision again when Apply runs. Successfully applied card IDs live alongside the lights, so two cards cannot both consume the same revision, even when their props match.

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

<hb-expander title="Complete react/src/LightChatbot.tsx">
<hb-code-example header="react/src/LightChatbot.tsx">

```tsx
import { s } from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import { createContext, useContext, useId, useState } from 'react';
import {
  applyLightProposal,
  canApplyLightProposal,
  initialLightState,
  type LightAuthorization,
  lightChatStatus,
  lightChatSystem,
  lightMessageOrigins,
  type LightProposalProps,
  type LightState,
  type ProposalOrigin,
  readLights,
} from '../../runtime/light-chatbot';

interface Session {
  readonly lights: LightState;
  readonly authorization: LightAuthorization;
  readonly applied: readonly string[];
  readonly apply: (
    origin: ProposalOrigin,
    props: LightProposalProps,
    id: string,
  ) => void;
}
const SessionContext = createContext<Session | null>(null);
const OriginContext = createContext<ProposalOrigin>({ turn: -1, revision: -1 });
function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Light components require LightChatbot.');
  return session;
}

/** Displays a proposal; only the user's click can change local application state. */
export function LightProposal(props: LightProposalProps) {
  const session = useSession();
  const currentOrigin = useContext(OriginContext);
  const [origin] = useState(() => currentOrigin);
  const id = useId();
  const used = session.applied.includes(id);
  const allowed = canApplyLightProposal(
    session.lights,
    origin,
    props,
    session.authorization,
    used,
  );

  return (
    <article aria-label="Light proposal">
      <h2>Proposed brightness</h2>
      <p>
        {props.lightId}: {props.brightness}%
      </p>
      <button
        type="button"
        disabled={!allowed}
        onClick={() => session.apply(origin, props, id)}
      >
        Apply brightness
      </button>
      <p data-testid="proposal-status">
        {used
          ? 'Applied.'
          : allowed
            ? 'Ready to apply.'
            : 'Unavailable for this run.'}
      </p>
    </article>
  );
}

/** Displays a tool-informed reading without offering an action. */
export function LightReading({ lightId, brightness }: LightProposalProps) {
  const { lights } = useSession();
  const light = lights.lights.find((item) => item.id === lightId);
  const valid =
    light &&
    Number.isInteger(brightness) &&
    brightness >= 0 &&
    brightness <= 100;
  return (
    <article aria-label="Light reading">
      <h2>Reported brightness</h2>
      <p data-testid="light-reading">
        {valid ? `${light.name}: ${brightness}%` : 'Invalid light reading.'}
      </p>
    </article>
  );
}
const propsSchema = {
  lightId: s.string('The light id returned by readLights'),
  brightness: s.number('Integer brightness from 0 to 100'),
};
const components = [
  exposeComponent(LightProposal, {
    name: 'LightProposal',
    description:
      'Propose a brightness change for the user to review and apply.',
    props: propsSchema,
    children: false,
  }),
  exposeComponent(LightReading, {
    name: 'LightReading',
    description:
      'Show the current brightness returned by readLights. Read-only.',
    props: propsSchema,
    children: false,
  }),
];

/** A tool-assisted conversation with explicit, revision-checked local changes. */
export function LightChatbot() {
  const [prompt, setPrompt] = useState('Set the desk light to 40%.');
  const [state, setState] = useState(() => ({
    lights: initialLightState(),
    applied: [] as readonly string[],
  }));
  const [request, setRequest] = useState({
    turn: 0,
    cancelled: false,
    origins: {} as Readonly<Record<string, ProposalOrigin>>,
  });
  const read = useTool({
    name: 'readLights',
    description:
      'Read the current simulated lights and their revision. Does not change any light.',
    handler: async () => readLights(state.lights),
    deps: [state.lights],
  });
  const chat = useUiChat({
    system: lightChatSystem,
    components,
    tools: [read],
  });
  const authorization: LightAuthorization = {
    turn: request.turn,
    cancelled: request.cancelled,
    settled: !chat.isLoading,
    error: !!chat.error,
    interrupted: !!chat.pendingInterrupts,
    finishReason: chat.lastRunFinishReason,
  };
  const origins = lightMessageOrigins(chat.messages, request.origins);
  const session: Session = {
    ...state,
    authorization,
    apply: (origin, props, id) =>
      setState((current) => {
        const lights = applyLightProposal(
          current.lights,
          origin,
          props,
          authorization,
          current.applied.includes(id),
        );
        return lights === current.lights
          ? current
          : { lights, applied: [...current.applied, id] };
      }),
  };

  function send() {
    if (!prompt.trim()) return;
    if (chat.isLoading) chat.stop();
    const turn = request.turn + 1;
    const id = `light-turn-${turn}`;
    setRequest({
      turn,
      cancelled: false,
      origins: {
        ...request.origins,
        [id]: { turn, revision: state.lights.revision },
      },
    });
    chat.sendMessage({ id, role: 'user', content: prompt.trim() });
    setPrompt('');
  }

  return (
    <SessionContext.Provider value={session}>
      <main>
        <h1>A conversation about one light</h1>
        <p>
          Simulated Desk light:{' '}
          <strong data-testid="light-brightness">
            {state.lights.lights[0].brightness}%
          </strong>{' '}
          · revision{' '}
          <span data-testid="light-revision">{state.lights.revision}</span>
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label htmlFor="light-message">Your message</label>
          <textarea
            id="light-message"
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
          <button type="submit" disabled={!prompt.trim()}>
            Send
          </button>
          <button
            type="button"
            disabled={!chat.isLoading}
            onClick={() => {
              setRequest((current) => ({ ...current, cancelled: true }));
              chat.stop();
            }}
          >
            Stop
          </button>
        </form>
        <p role="status" data-testid="chat-status">
          {lightChatStatus(authorization)}
        </p>
        <ol aria-label="Conversation">
          {chat.messages.map((message, index) => (
            <li key={'id' in message ? message.id : `error-${index}`}>
              {message.role === 'user' ? (
                <p>You: {String(message.content)}</p>
              ) : message.role === 'assistant' ? (
                <OriginContext.Provider
                  value={origins[message.id] ?? { turn: -1, revision: -1 }}
                >
                  {message.ui}
                </OriginContext.Provider>
              ) : null}
            </li>
          ))}
        </ol>
      </main>
    </SessionContext.Provider>
  );
}
```

</hb-code-example>
</hb-expander>

## Next steps

Use [tools](/docs/react/concept/functions) to expose other small application reads. Keep actions explicit, validate their values at the boundary that owns the state, and use [Skillet](/docs/react/concept/schema) to describe the components your assistant can render.
