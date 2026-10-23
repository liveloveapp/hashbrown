import { Fragment, useState } from 'react';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  useChat,
  useUiChat,
  useUiKit,
} from '@hashbrownai/react';
import { WelcomeCard } from './WelcomeCard';

/** The independently selectable client workflow examples. */
export type WorkflowDemoMode =
  'interrupts' | 'shared-state' | 'activities' | 'ui-kits';

const initialState = { destination: 'Lisbon', status: 'Draft' };
const headings = {
  interrupts: 'Pause, approve, and resume',
  'shared-state': 'Edit shared agent state',
  activities: 'Follow the work as it happens',
  'ui-kits': 'Generate UI from a trusted kit',
};

/** Renders a status card offered by the application. */
function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <article aria-label="Status card">
      <h2>{title}</h2>
      <p>{message}</p>
    </article>
  );
}

const components = [
  exposeComponent(WelcomeCard, {
    name: 'WelcomeCard',
    description: 'Welcome a traveler to their destination.',
    props: {
      title: s.string('A short title'),
      message: s.string('A short welcome'),
    },
    children: false,
  }),
  exposeComponent(StatusCard, {
    name: 'StatusCard',
    description: 'Summarize the status of an itinerary.',
    props: {
      title: s.string('A short status title'),
      message: s.string('The itinerary status'),
    },
    children: false,
  }),
];

/** Validates display-only activity content before using it in the interface. */
function readProgress(content: unknown) {
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

/** Demonstrates text, interrupt, state, and activity APIs through one real runtime. */
function TextWorkflow({
  mode,
}: {
  mode: Exclude<WorkflowDemoMode, 'ui-kits'>;
}) {
  const chat = useChat({
    system: 'Help plan a trip to Lisbon.',
    state: initialState,
  });
  const batch = chat.pendingInterrupts;
  const answerBatch = (approved: boolean) => {
    if (!batch) return;
    chat.resume({
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
  };

  return (
    <main>
      <h1>{headings[mode]}</h1>
      {mode === 'shared-state' && (
        <>
          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            value={chat.state?.destination ?? ''}
            disabled={chat.isLoading}
            onChange={(event) =>
              chat.setState({
                destination: event.target.value,
                status: 'Draft',
              })
            }
          />
          <p>
            Agent state: <strong>{chat.state?.status}</strong>
          </p>
        </>
      )}
      <button
        type="button"
        disabled={chat.isLoading || Boolean(batch)}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content:
              mode === 'activities'
                ? 'Build a three-day itinerary.'
                : 'Plan my trip.',
          })
        }
      >
        {mode === 'interrupts'
          ? 'Plan a trip'
          : mode === 'activities'
            ? 'Build an itinerary'
            : 'Ask the agent to plan'}
      </button>
      {chat.isLoading && (
        <p role="status">
          {chat.isResuming
            ? 'Resuming your trip...'
            : 'Working on your trip...'}
        </p>
      )}
      {chat.error && <p role="alert">The request failed. Try again.</p>}
      {chat.messages.map((message, index) => {
        if (message.role === 'assistant')
          return <p key={index}>{message.content}</p>;
        if (
          message.role === 'activity' &&
          message.activityType === 'trip-progress'
        ) {
          const progress = readProgress(message.content);
          return progress ? (
            <article key={message.id} aria-label="Itinerary progress">
              <h2>{progress.label}</h2>
              <progress
                aria-label="Completed itinerary steps"
                max={progress.total}
                value={progress.completed}
              />
              <p>
                {progress.completed} of {progress.total} steps complete
              </p>
            </article>
          ) : null;
        }
        return null;
      })}
      {batch && (
        <article aria-label="Approval required">
          <h2>Review your trip</h2>
          <ul>
            {batch.interrupts.map((interrupt) => (
              <li key={interrupt.id}>
                {interrupt.message ?? interrupt.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={chat.isResuming}
            onClick={() => answerBatch(true)}
          >
            Approve and resume
          </button>{' '}
          <button
            type="button"
            disabled={chat.isResuming}
            onClick={() => answerBatch(false)}
          >
            Decline trip
          </button>
        </article>
      )}
    </main>
  );
}

/** Composes trusted components into a kit used by the real UI chat schema. */
function KitWorkflow() {
  const kit = useUiKit({ components });
  const chat = useUiChat({
    system: 'Use the requested card from the provided UI kit.',
    components: [kit],
  });
  const [card, setCard] = useState('welcome');

  return (
    <main>
      <h1>{headings['ui-kits']}</h1>
      <p>
        The kit exposes WelcomeCard and StatusCard with validated title and
        message props.
      </p>
      <label htmlFor="card">Card to generate</label>
      <select
        id="card"
        value={card}
        disabled={chat.isLoading}
        onChange={(event) => setCard(event.target.value)}
      >
        <option value="welcome">Welcome card</option>
        <option value="status">Status card</option>
      </select>{' '}
      <button
        type="button"
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({ role: 'user', content: `Generate a ${card} card` })
        }
      >
        Generate a card
      </button>
      {chat.isLoading && <p role="status">Generating a trusted component...</p>}
      {chat.error && <p role="alert">The request failed. Try again.</p>}
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
    </main>
  );
}

/** Runs a checked client workflow selected by prop or the recording URL. */
export function Workflows({
  mode = (new URLSearchParams(location.search).get('mode') ??
    'interrupts') as WorkflowDemoMode,
}: {
  mode?: WorkflowDemoMode;
}) {
  return mode === 'ui-kits' ? <KitWorkflow /> : <TextWorkflow mode={mode} />;
}
