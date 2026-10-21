import {
  addTurn,
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  CARDS_MIN_CONFIDENCE,
  CARDS_SELECT_MAX,
  createBrowserAtcTools,
  flightCardContract,
  observeDecisions,
  refinements,
  ROUTER_SKIPPED,
  type RouterShown,
  settleCards,
  type Starter,
  transcriptItems,
  type TurnShown,
  withDecoded,
} from '@atc/shared';
import { createHttpDecisionTransport, type Decision } from '@hashbrownai/core';
import {
  exposeComponent,
  exposeMarkdown,
  useTool,
  useUiChat,
  useUiDecision,
  useUiKit,
} from '@hashbrownai/react';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { usePublishDev } from './dev-mode';
import { useAutoScroll } from './auto-scroll';
import { EmptyState } from './empty-state';
import { useAtcStore } from './store';
import { Transcript } from './transcript';

// 1. Expose your components, in two kits. The model can only render these, and
//    Skillet validates every prop. IDs never stream, so a card never shows the
//    wrong plane. Prose (Markdown) is never asked about and always sent; the
//    cards are narrowed per turn in step 4. The order, prose then cards, is the
//    server's pinned order (server/src/run-handler.ts), so a narrowed schema is
//    one the server accepts.
const prose = [exposeMarkdown({ className: 'atc-prose' })];
const cards = [
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

const CARDS_TRANSPORT = createHttpDecisionTransport({
  url: '/api/decide?kind=cards',
});

/**
 * The chat panel: components, browser-side tools and the streaming answer,
 * with the one composer that routes what is typed. `onFilter` applies a
 * natural-language map filter (with what the router decided, for the
 * developer drawer); `onSent` is called when the user sends
 * anything (to the chat, to the filter, or a clear).
 */
export function Assistant({
  onFilter,
  onSent,
  routeTransport,
  cardsTransport = CARDS_TRANSPORT,
}: {
  onFilter: (request: string, routed: RouterShown) => void;
  onSent?: () => void;
  /** Replaces the router's HTTP transport (tests). */
  routeTransport?: Decision.Transport;
  /** Replaces the cards decision's HTTP transport (tests). */
  cardsTransport?: Decision.Transport;
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
  const proseKit = useUiKit({ components: prose, selectable: false });
  const cardsKit = useUiKit({ components: cards });
  const chat = useUiChat({
    // Required by Hashbrown; the server replaces it with SYSTEM_PROMPT
    // (server/src/run-handler.ts), so the browser cannot change the rules.
    system: 'Provided by the server.',
    components: [proseKit, cardsKit],
    tools,
  });
  const scroller = useAutoScroll<HTMLDivElement>();
  const items = useMemo(
    () => transcriptItems(chat.messages, chat.isLoading),
    [chat.messages, chat.isLoading],
  );
  // 4. Decide: route what the user typed, then narrow the cards. The composer
  //    asks a Jev decision (react/src/router.ts) and calls one of these; the
  //    filter route adds nothing to the transcript. A chat message first asks
  //    which of the cards fit it (at most two, with confidence 0.7), and the
  //    chat sends with only those plus Markdown. The server pins the questions
  //    (server/src/decide-handler.ts); an unsure or failed decision sends
  //    with every card.
  // The developer drawer: each send's router decision and cards decision,
  // recorded in order (superseded sends stay). A starter skips the router.
  const [turns, setTurns] = useState<readonly TurnShown[]>([]);
  const observed = useMemo(
    () =>
      observeDecisions(cardsTransport, (settled) =>
        setTurns((current) => settleCards(current, settled)),
      ),
    [cardsTransport],
  );
  const narrowed = useUiDecision({
    chat,
    select: { max: CARDS_SELECT_MAX },
    minConfidence: CARDS_MIN_CONFIDENCE,
    system: 'Provided by the server.',
    transport: observed,
  });
  // Once the decision settles, the hook's decoded value (or its error) is
  // what the chat acted on, so the drawer shows that.
  const { isDeciding, decisionError, decision } = narrowed;
  useEffect(() => {
    if (isDeciding) {
      return;
    }
    if (decisionError) {
      setTurns((current) => withDecoded(current, decisionError));
    } else if (decision.value && decision.meta) {
      setTurns((current) =>
        withDecoded(current, { value: decision.value, meta: decision.meta }),
      );
    }
  }, [isDeciding, decisionError, decision.value, decision.meta]);
  // The drawer reads the chat as it streams.
  const devChat = useMemo(
    () => ({ items, turns, busy: chat.isLoading }),
    [items, turns, chat.isLoading],
  );
  usePublishDev('chat', devChat);
  const send = (content: string, routed: RouterShown) => {
    narrowed.sendMessage(content);
    // Added once the chat accepted the message: the drawer keeps this send's
    // router decision, and the cards decision joins it when it settles.
    setTurns((current) => addTurn(current, routed, content));
    onSent?.();
  };
  const filter = (request: string, routed: RouterShown) => {
    onFilter(request, routed);
    onSent?.();
  };
  const clear = () => {
    store.clearMapFilter();
    onSent?.();
  };
  // Ways to narrow the filter on the map, derived from it and the traffic.
  const applied = useSyncExternalStore(
    store.subscribe,
    () => store.getState().mapFilter,
  );
  const aircraft = useSyncExternalStore(
    store.subscribe,
    () => store.getState().aircraft,
  );
  const suggestions = useMemo(
    () => refinements(applied, [...aircraft.values()]),
    [applied, aircraft],
  );
  const refineLabelId = useId();
  const pick = (starter: Starter) =>
    starter.route === 'filter'
      ? filter(starter.text, ROUTER_SKIPPED)
      : send(starter.text, ROUTER_SKIPPED);
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
        <Transcript items={items} busy={chat.isLoading} turns={turns} />
        {chat.error ? (
          <div className="atc-card atc-error" role="alert">
            <span>The assistant didn&apos;t answer. Try again.</span>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
      {suggestions.length > 0 ? (
        <div
          className="atc-refinements"
          data-testid="refinements"
          role="group"
          aria-labelledby={refineLabelId}
        >
          <span id={refineLabelId} className="atc-refinements-label">
            Refine:
          </span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.text}
              type="button"
              className="atc-refinement"
              onClick={() => filter(suggestion.text, ROUTER_SKIPPED)}
            >
              {suggestion.text}
            </button>
          ))}
        </div>
      ) : null}
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
