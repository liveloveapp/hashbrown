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
