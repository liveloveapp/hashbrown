import {
  aircraftCompareContract,
  arrivalsBoardContract,
  createAtcTools,
  fetchRoute,
  flightCardContract,
  transcriptItems,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  output,
} from '@angular/core';
import {
  createTool,
  exposeComponent,
  exposeMarkdown,
  type UiChatMessage,
  uiChatResource,
} from '@hashbrownai/angular';
import {
  AircraftCompare,
  AircraftCompareFallback,
} from './components/aircraft-compare';
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

// 1. Expose your components. The model can only render these, and Skillet
//    validates every input. IDs never stream, so a card never shows the wrong plane.
const components = [
  exposeMarkdown({ className: 'atc-prose' }),
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
];

/** The chat panel: components, browser-side tools and the streaming answer. */
@Component({
  selector: 'atc-assistant',
  imports: [AutoScroll, Composer, EmptyState, Transcript],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-chat' },
  template: `
    <div class="atc-chat-body" atcAutoScroll>
      @if (messages().length === 0 && !chat.error()) {
        <atc-empty-state (pick)="send($event)" />
      }
      <atc-transcript [items]="items()" [busy]="chat.isLoading()" />
      @if (chat.error()) {
        <div class="atc-card atc-error" role="alert">
          <span>The assistant didn't answer. Try again.</span>
          <button type="button" (click)="retry()">Retry</button>
        </div>
      }
    </div>
    <atc-composer [busy]="chat.isLoading()" (send)="send($event)" />
  `,
})
export class Assistant {
  /** Emits when the user sends a message. */
  readonly sent = output();
  private readonly atc = createAtcTools({
    store: inject(ATC_STORE),
    fetchRoute,
  });

  // 2. Give the model tools. They run here in the browser, against the aircraft
  //    already on the map; no plane list goes to the server.
  private readonly tools = [
    createTool(this.atc.findAircraft),
    createTool(this.atc.getSelectedAircraft),
    createTool(this.atc.lookupRoute),
    createTool(this.atc.highlightAircraft),
    createTool(this.atc.clearHighlight),
    createTool(this.atc.followAircraft),
    createTool(this.atc.stopFollowing),
    createTool(this.atc.lookupPlace),
    createTool(this.atc.showArea),
    createTool(this.atc.resetMap),
  ];

  // 3. Render the stream.
  protected readonly chat = uiChatResource({
    // Required by Hashbrown; the server replaces it with SYSTEM_PROMPT
    // (server/src/run-handler.ts), so the browser cannot change the rules.
    system: 'Provided by the server.',
    components,
    tools: this.tools,
  });

  // An Angular resource's value() throws while it is in error; keep the last
  // transcript on screen so the user sees what Retry will resend.
  protected readonly messages = linkedSignal({
    source: () => (this.chat.status() === 'error' ? null : this.chat.value()),
    computation: (value, prev): UiChatMessage[] => value ?? prev?.value ?? [],
  });
  protected readonly items = computed(() => transcriptItems(this.messages()));

  protected send(content: string): void {
    this.chat.sendMessage({ role: 'user', content });
    this.sent.emit();
  }

  /** Retries the last answer, or resends the first message when it never got one. */
  protected retry(): void {
    if (!this.chat.reload()) {
      this.chat.resendMessages();
    }
  }
}
