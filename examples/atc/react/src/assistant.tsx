import {
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  createBrowserAtcTools,
  flightCardContract,
  type Starter,
  transcriptItems,
} from '@atc/shared';
import type { Decision } from '@hashbrownai/core';
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
import { AirportCard, AirportCardFallback } from './components/airport-card';
import {
  ArrivalsBoard,
  ArrivalsBoardFallback,
} from './components/arrivals-board';
import { FlightCard, FlightCardFallback } from './components/flight-card';
import { Composer } from './composer';
import { useAutoScroll } from './auto-scroll';
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
  exposeComponent(AirportCard, {
    name: airportCardContract.name,
    description: airportCardContract.description,
    props: airportCardContract.props,
    fallback: AirportCardFallback,
    children: false,
  }),
];

/**
 * The chat panel: components, browser-side tools and the streaming answer,
 * with the one composer that routes what is typed. `onFilter` applies a
 * natural-language map filter; `onSent` is called when the user sends
 * anything (to the chat, to the filter, or a clear).
 */
export function Assistant({
  onFilter,
  onSent,
  routeTransport,
}: {
  onFilter: (request: string) => void;
  onSent?: () => void;
  /** Replaces the router's HTTP transport (tests). */
  routeTransport?: Decision.Transport;
}) {
  const store = useAtcStore();

  // 2. Give the model tools. They run here in the browser, against the aircraft
  //    already on the map; no plane list goes to the server.
  const atcTools = useMemo(() => createBrowserAtcTools(store), [store]);
  // deps works like useCallback's: each tool is rebuilt only when the tools
  // object changes.
  const tools = [
    useTool({ ...atcTools.findAircraft, deps: [atcTools] }),
    useTool({ ...atcTools.getSelectedAircraft, deps: [atcTools] }),
    useTool({ ...atcTools.lookupRoute, deps: [atcTools] }),
    useTool({ ...atcTools.highlightAircraft, deps: [atcTools] }),
    useTool({ ...atcTools.clearHighlight, deps: [atcTools] }),
    useTool({ ...atcTools.followAircraft, deps: [atcTools] }),
    useTool({ ...atcTools.stopFollowing, deps: [atcTools] }),
    useTool({ ...atcTools.lookupPlace, deps: [atcTools] }),
    useTool({ ...atcTools.showArea, deps: [atcTools] }),
    useTool({ ...atcTools.resetMap, deps: [atcTools] }),
    useTool({ ...atcTools.showAirport, deps: [atcTools] }),
    useTool({ ...atcTools.showAirspace, deps: [atcTools] }),
    useTool({ ...atcTools.airspaceAt, deps: [atcTools] }),
    useTool({ ...atcTools.setLayers, deps: [atcTools] }),
    useTool({ ...atcTools.setMapFilter, deps: [atcTools] }),
    useTool({ ...atcTools.clearMapFilter, deps: [atcTools] }),
  ];

  // 3. Render the stream.
  const chat = useUiChat({
    // Required by Hashbrown; the server replaces it with SYSTEM_PROMPT
    // (server/src/run-handler.ts), so the browser cannot change the rules.
    system: 'Provided by the server.',
    components,
    tools,
  });
  const scroller = useAutoScroll<HTMLDivElement>();
  const send = (content: string) => {
    chat.sendMessage({ role: 'user', content });
    onSent?.();
  };
  // 4. Decide: route what the user typed. The composer asks a Jev decision
  //    (react/src/router.ts) and calls one of these; the filter route adds
  //    nothing to the transcript.
  const filter = (request: string) => {
    onFilter(request);
    onSent?.();
  };
  const clear = () => {
    store.clearMapFilter();
    onSent?.();
  };
  const pick = (starter: Starter) =>
    starter.route === 'filter' ? filter(starter.text) : send(starter.text);
  // Retries the last answer, or resends the first message when it never got one.
  const retry = () =>
    chat.messages.at(-1)?.role === 'assistant'
      ? chat.reload()
      : chat.resendMessages();

  return (
    <div className="atc-chat">
      <div className="atc-chat-body" {...scroller}>
        {chat.messages.length === 0 && !chat.error ? (
          <EmptyState onPick={pick} />
        ) : null}
        <Transcript
          items={transcriptItems(chat.messages, chat.isLoading)}
          busy={chat.isLoading}
        />
        {chat.error ? (
          <div className="atc-card atc-error" role="alert">
            <span>The assistant didn&apos;t answer. Try again.</span>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
      <Composer
        busy={chat.isLoading}
        onChat={send}
        onFilter={filter}
        onClear={clear}
        transport={routeTransport}
      />
    </div>
  );
}
