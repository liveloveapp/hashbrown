import {
  aircraftCompareContract,
  arrivalsBoardContract,
  createAtcTools,
  fetchRoute,
  flightCardContract,
  transcriptItems,
} from '@atc/shared';
import {
  exposeComponent,
  exposeMarkdown,
  useTool,
  useUiChat,
} from '@hashbrownai/react';
import { useMemo } from 'react';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
import {
  ArrivalsBoard,
  ArrivalsBoardFallback,
} from './components/arrivals-board';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { Composer } from './composer';
import { useAutoScroll } from './dom-hooks';
import { EmptyState } from './empty-state';
import { useAtcStore } from './store';
import { Transcript } from './transcript';

// 1. Expose your components. The model can only render these, and Skillet
//    validates every prop. IDs never stream, so a card never shows the wrong plane.
const components = [
  exposeMarkdown({ className: 'atc-prose' }),
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

/** The chat panel: components, browser-side tools and the streaming answer. */
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
  const scroller = useAutoScroll<HTMLDivElement>();
  const send = (content: string) => chat.sendMessage({ role: 'user', content });

  return (
    <div className="atc-chat" role="region" aria-label="Assistant">
      <div className="atc-chat-body" {...scroller}>
        {chat.messages.length === 0 && !chat.error ? (
          <EmptyState onPick={send} />
        ) : null}
        <Transcript
          items={transcriptItems(chat.messages)}
          busy={chat.isLoading}
        />
        {chat.error ? (
          <p className="atc-error" role="alert">
            Something went wrong.{' '}
            <button type="button" onClick={() => chat.resendMessages()}>
              Retry
            </button>
          </p>
        ) : null}
      </div>
      <Composer busy={chat.isLoading} onSend={send} />
    </div>
  );
}
