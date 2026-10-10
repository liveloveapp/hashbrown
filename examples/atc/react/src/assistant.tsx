import {
  aircraftCompareContract,
  arrivalsBoardContract,
  createAtcTools,
  fetchRoute,
  flightCardContract,
  messageText,
  STARTER_PROMPTS,
} from '@atc/shared';
import {
  exposeComponent,
  exposeMarkdown,
  useTool,
  useUiChat,
} from '@hashbrownai/react';
import { type FormEvent, useMemo, useState } from 'react';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
import {
  ArrivalsBoard,
  ArrivalsBoardFallback,
} from './components/arrivals-board';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { useAtcStore } from './store';

// 1. Expose your components. The model can only render these, and Skillet
//    validates every prop. IDs never stream, so a card never shows the wrong plane.
const components = [
  exposeMarkdown(),
  exposeComponent(FlightCard, {
    name: flightCardContract.name,
    description: flightCardContract.description,
    props: flightCardContract.props,
    fallback: FlightCardFallback,
    children: false,
  }),
  exposeComponent(ArrivalsBoard, {
    name: arrivalsBoardContract.name,
    description: arrivalsBoardContract.description,
    props: arrivalsBoardContract.props,
    fallback: ArrivalsBoardFallback,
    children: false,
  }),
  exposeComponent(AircraftCompare, {
    name: aircraftCompareContract.name,
    description: aircraftCompareContract.description,
    props: aircraftCompareContract.props,
    fallback: AircraftCompareFallback,
    children: false,
  }),
];

/** The overlay chat: components, browser-side tools and the streaming answer. */
export function Assistant() {
  const store = useAtcStore();
  const atc = useMemo(() => createAtcTools({ store, fetchRoute }), [store]);

  // 2. Give the model tools. They run here in the browser, against the aircraft
  //    already on the map; no plane list goes to the server.
  const tools = [
    useTool({ ...atc.findAircraft, deps: [atc] }),
    useTool({ ...atc.getSelectedAircraft, deps: [atc] }),
    useTool({ ...atc.lookupRoute, deps: [atc] }),
    useTool({ ...atc.highlightAircraft, deps: [atc] }),
    useTool({ ...atc.clearHighlight, deps: [atc] }),
    useTool({ ...atc.followAircraft, deps: [atc] }),
    useTool({ ...atc.stopFollowing, deps: [atc] }),
  ];

  // 3. Render the stream. The system prompt is pinned on the server.
  const chat = useUiChat({
    system: 'Provided by the server.',
    components,
    tools,
  });
  const [draft, setDraft] = useState('');

  const send = (text: string) => {
    const content = text.trim();
    if (content) {
      chat.sendMessage({ role: 'user', content });
      setDraft('');
    }
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <section className="atc-assistant" aria-label="Assistant">
      <ol className="atc-transcript">
        {chat.messages.map((message, index) =>
          message.role === 'user' ? (
            <li key={index} className="atc-user">
              {messageText(message.content)}
            </li>
          ) : message.role === 'assistant' &&
            message.ui &&
            message.ui.length > 0 ? (
            <li key={index}>{message.ui}</li>
          ) : null,
        )}
      </ol>
      {chat.error ? (
        <p className="atc-error" role="alert">
          Something went wrong.{' '}
          <button type="button" onClick={() => chat.reload()}>
            Retry
          </button>
        </p>
      ) : null}
      {chat.messages.length === 0 ? (
        <div className="atc-starters">
          {STARTER_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" onClick={() => send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      <form className="atc-composer" onSubmit={onSubmit}>
        <input
          aria-label="Message"
          placeholder="Ask about the planes on the map"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={chat.isLoading}>
          Send
        </button>
      </form>
    </section>
  );
}
