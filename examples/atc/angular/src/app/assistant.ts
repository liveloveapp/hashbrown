import {
  addTurn,
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  type AtcState,
  CARDS_MIN_CONFIDENCE,
  CARDS_SELECT_MAX,
  createBrowserAtcTools,
  flightCardContract,
  focusComposerAfterRefinement,
  NO_REFINEMENTS,
  observeDecisions,
  ROUTER_SKIPPED,
  ROUTER_SKIPPED_REFINEMENT,
  type RouterShown,
  settleCards,
  stableRefinements,
  type StableRefinements,
  type Starter,
  transcriptItems,
  type TurnShown,
  withDecoded,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
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
import { DevMode, publishDev } from './dev-mode';
import { EmptyState } from './empty-state';
import { ATC_STORE, injectAtcState } from './store';
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

let nextRefineId = 0;

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
      <atc-transcript
        [items]="items()"
        [busy]="chat.isLoading()"
        [turns]="turns()"
      />
      @if (chat.error()) {
        <div class="atc-card atc-error" role="alert">
          <span>The assistant didn't answer. Try again.</span>
          <button type="button" (click)="retry()">Retry</button>
        </div>
      }
    </div>
    @if (suggestions().length > 0) {
      <div
        class="atc-refinements"
        data-testid="refinements"
        role="group"
        [attr.aria-labelledby]="refineLabelId"
      >
        <span [id]="refineLabelId" class="atc-refinements-label">Refine:</span>
        @for (suggestion of suggestions(); track suggestion.text) {
          <button
            type="button"
            class="atc-refinement"
            (click)="refine(suggestion.text, $event)"
          >
            {{ suggestion.text }}
          </button>
        }
      </div>
    }
    <atc-composer
      [busy]="chat.isLoading()"
      (routed)="routed.set($event)"
      (chat)="send($event)"
      (filter)="applyFilter($event)"
      (clear)="clearFilter($event)"
    />
  `,
})
export class Assistant {
  /** True while a map filter run streams; the "Refine:" row waits for it. */
  readonly filterLoading = input(false);
  /** Emits when the user sends anything (to the chat, to the filter, or a clear). */
  readonly sent = output();
  /** Emits the request the user routed to the natural-language map filter. */
  readonly filter = output<string>();
  /** Emits what the router decided, just before `filter` (for the developer drawer). */
  readonly filterRouted = output<RouterShown>();
  private readonly store = inject(ATC_STORE);
  // Every submission, whichever route it took, for the drawer's Router tab.
  private readonly dev = inject(DevMode);

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
  protected readonly refineLabelId = `atc-refine-${nextRefineId++}`;
  // Ways to narrow the filter on the map, from it and the traffic: computed
  // once per filter after its run settles, so they hold still as planes move.
  private readonly atcState = injectAtcState();
  private readonly held = linkedSignal<
    { loading: boolean; state: AtcState },
    StableRefinements
  >({
    source: () => ({ loading: this.filterLoading(), state: this.atcState() }),
    computation: ({ loading, state }, prev) => {
      const held = prev?.value ?? NO_REFINEMENTS;

      return loading
        ? held
        : stableRefinements(held, state.mapFilter, [
            ...state.aircraft.values(),
          ]);
    },
  });
  protected readonly suggestions = computed(() =>
    this.filterLoading() ? [] : this.held().list,
  );
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
  //
  //    The developer drawer: each send's router decision and cards decision,
  //    recorded in order (superseded sends stay). A starter skips the router.
  protected readonly turns = signal<readonly TurnShown[]>([]);
  /** What the router decided for the text the composer is sending. */
  protected readonly routed = signal<RouterShown>(ROUTER_SKIPPED);
  private readonly narrowed = uiDecisionResource({
    chat: this.chat,
    select: { max: CARDS_SELECT_MAX },
    minConfidence: CARDS_MIN_CONFIDENCE,
    system: 'Provided by the server.',
    transport: observeDecisions(inject(CARDS_DECISION_TRANSPORT), (settled) =>
      this.turns.update((turns) => settleCards(turns, settled)),
    ),
  });

  constructor() {
    // The drawer reads the chat as it streams.
    publishDev(
      'chat',
      computed(() => ({
        items: this.items(),
        turns: this.turns(),
        busy: this.chat.isLoading(),
      })),
    );
    // Once the decision settles, the hook's decoded value (or its error) is
    // what the chat acted on, so the drawer shows that.
    effect(() => {
      const deciding = this.narrowed.isDeciding();
      const error = this.narrowed.decisionError();
      const value = this.narrowed.decision.value();
      const meta = this.narrowed.decision.meta();
      if (deciding) {
        return;
      }
      untracked(() => {
        if (error) {
          this.turns.update((turns) => withDecoded(turns, error));
        } else if (value && meta) {
          this.turns.update((turns) => withDecoded(turns, { value, meta }));
        }
      });
    });
  }

  protected send(content: string, routed = this.routed()): void {
    this.narrowed.sendMessage(content);
    // Added once the chat accepted the message: the drawer keeps this send's
    // router decision, and the cards decision joins it when it settles.
    this.turns.update((turns) => addTurn(turns, routed, content));
    this.dev.recordRoute({ text: content, router: routed, outcome: 'chat' });
    this.sent.emit();
  }

  protected applyFilter(request: string, routed = this.routed()): void {
    this.filterRouted.emit(routed);
    this.filter.emit(request);
    this.dev.recordRoute({ text: request, router: routed, outcome: 'filter' });
    this.sent.emit();
  }

  protected clearFilter(content: string, routed = this.routed()): void {
    this.store.clearMapFilter();
    this.dev.recordRoute({ text: content, router: routed, outcome: 'clear' });
    this.sent.emit();
  }

  protected refine(text: string, event: MouseEvent): void {
    this.applyFilter(text, ROUTER_SKIPPED_REFINEMENT);
    if (event.currentTarget instanceof Element) {
      focusComposerAfterRefinement(event.currentTarget, event.detail);
    }
  }

  protected pick(starter: Starter): void {
    if (starter.route === 'filter') {
      this.applyFilter(starter.text, ROUTER_SKIPPED);
    } else {
      this.send(starter.text, ROUTER_SKIPPED);
    }
  }

  /** Retries the last answer, or resends the first message when it never got one. */
  protected retry(): void {
    if (!this.chat.reload()) {
      this.chat.resendMessages();
    }
  }
}
