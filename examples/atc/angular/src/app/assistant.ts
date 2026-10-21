import {
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  createBrowserAtcTools,
  flightCardContract,
  type Starter,
  transcriptItems,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  linkedSignal,
  output,
} from '@angular/core';
import {
  createTool,
  createUiKit,
  exposeComponent,
  exposeMarkdown,
  type UiChatMessage,
  uiChatResource,
  uiDecisionResource,
} from '@hashbrownai/angular';
import { createHttpDecisionTransport, type Decision } from '@hashbrownai/core';
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
import { AutoScroll } from './auto-scroll';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { ATC_STORE } from './store';
import { Transcript } from './transcript';

// 1. Expose your components, in two kits. The model can only render these, and
//    Skillet validates every input. IDs never stream, so a card never shows the
//    wrong plane. Prose (Markdown) is never asked about and always sent; the
//    cards are narrowed per turn in step 4. The order, prose then cards, is the
//    server's pinned order (server/src/run-handler.ts), so a narrowed schema is
//    one the server accepts.
const proseKit = createUiKit({
  components: [exposeMarkdown({ className: 'atc-prose' })],
  selectable: false,
});
const cardsKit = createUiKit({
  components: [
    exposeComponent(FlightCard, {
      name: flightCardContract.name,
      description: flightCardContract.description,
      input: flightCardContract.props,
      fallback: FlightCardFallback,
      children: false,
    }),
    exposeComponent(ArrivalsBoard, {
      name: arrivalsBoardContract.name,
      description: arrivalsBoardContract.description,
      input: arrivalsBoardContract.props,
      fallback: ArrivalsBoardFallback,
      children: false,
    }),
    exposeComponent(AircraftCompare, {
      name: aircraftCompareContract.name,
      description: aircraftCompareContract.description,
      input: aircraftCompareContract.props,
      fallback: AircraftCompareFallback,
      children: false,
    }),
    exposeComponent(AirportCard, {
      name: airportCardContract.name,
      description: airportCardContract.description,
      input: airportCardContract.props,
      fallback: AirportCardFallback,
      children: false,
    }),
  ],
});

/** The transport the cards decision asks; tests provide a fake. */
export const CARDS_DECISION_TRANSPORT = new InjectionToken<Decision.Transport>(
  'atc cards decision transport',
  {
    providedIn: 'root',
    factory: () =>
      createHttpDecisionTransport({ url: '/api/decide?kind=cards' }),
  },
);

/**
 * The chat panel: components, browser-side tools and the streaming answer,
 * with the one composer that routes what is typed.
 */
@Component({
  selector: 'atc-assistant',
  imports: [AutoScroll, Composer, EmptyState, Transcript],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-chat' },
  template: `
    <div class="atc-chat-body" atcAutoScroll>
      @if (messages().length === 0 && !chat.error()) {
        <atc-empty-state (pick)="pick($event)" />
      }
      <atc-transcript [items]="items()" [busy]="chat.isLoading()" />
      @if (chat.error()) {
        <div class="atc-card atc-error" role="alert">
          <span>The assistant didn't answer. Try again.</span>
          <button type="button" (click)="retry()">Retry</button>
        </div>
      }
    </div>
    <atc-composer
      [busy]="chat.isLoading()"
      (chat)="send($event)"
      (filter)="applyFilter($event)"
      (clear)="clearFilter()"
    />
  `,
})
export class Assistant {
  /** Emits when the user sends anything (to the chat, to the filter, or a clear). */
  readonly sent = output();
  /** Emits the request the user routed to the natural-language map filter. */
  readonly filter = output<string>();
  private readonly store = inject(ATC_STORE);

  // 2. Give the model tools. They run here in the browser, against the aircraft
  //    already on the map; no plane list goes to the server.
  private readonly atcTools = createBrowserAtcTools(this.store);
  private readonly tools = [
    createTool(this.atcTools.findAircraft),
    createTool(this.atcTools.getSelectedAircraft),
    createTool(this.atcTools.lookupRoute),
    createTool(this.atcTools.highlightAircraft),
    createTool(this.atcTools.clearHighlight),
    createTool(this.atcTools.followAircraft),
    createTool(this.atcTools.stopFollowing),
    createTool(this.atcTools.lookupPlace),
    createTool(this.atcTools.showArea),
    createTool(this.atcTools.resetMap),
    createTool(this.atcTools.showAirport),
    createTool(this.atcTools.showAirspace),
    createTool(this.atcTools.airspaceAt),
    createTool(this.atcTools.setLayers),
    createTool(this.atcTools.setMapFilter),
    createTool(this.atcTools.clearMapFilter),
  ];

  // 3. Render the stream.
  protected readonly chat = uiChatResource({
    // Required by Hashbrown; the server replaces it with SYSTEM_PROMPT
    // (server/src/run-handler.ts), so the browser cannot change the rules.
    system: 'Provided by the server.',
    components: [proseKit, cardsKit],
    tools: this.tools,
  });

  // An Angular resource's value() throws while it is in error; keep the last
  // transcript on screen so the user sees what Retry will resend.
  protected readonly messages = linkedSignal({
    source: () => (this.chat.status() === 'error' ? null : this.chat.value()),
    computation: (value, prev): UiChatMessage[] => value ?? prev?.value ?? [],
  });
  protected readonly items = computed(() =>
    transcriptItems(this.messages(), this.chat.isLoading()),
  );

  // 4. Decide: route what the user typed, then narrow the cards. The composer
  //    asks a Jev decision (angular/src/app/router.ts) and emits one of these;
  //    the filter route adds nothing to the transcript. A chat message first
  //    asks which of the cards fit it (at most two, with confidence 0.7), and
  //    the chat sends with only those plus Markdown. The server pins the
  //    questions (server/src/decide-handler.ts); an unsure or failed decision
  //    sends with every card.
  private readonly narrowed = uiDecisionResource({
    chat: this.chat,
    select: { max: 2 },
    minConfidence: 0.7,
    system: 'Provided by the server.',
    transport: inject(CARDS_DECISION_TRANSPORT),
  });

  protected send(content: string): void {
    this.narrowed.sendMessage(content);
    this.sent.emit();
  }

  protected applyFilter(request: string): void {
    this.filter.emit(request);
    this.sent.emit();
  }

  protected clearFilter(): void {
    this.store.clearMapFilter();
    this.sent.emit();
  }

  protected pick(starter: Starter): void {
    if (starter.route === 'filter') {
      this.applyFilter(starter.text);
    } else {
      this.send(starter.text);
    }
  }

  /** Retries the last answer, or resends the first message when it never got one. */
  protected retry(): void {
    if (!this.chat.reload()) {
      this.chat.resendMessages();
    }
  }
}
