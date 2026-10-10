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
} from '@angular/core';
import {
  createTool,
  exposeComponent,
  exposeMarkdown,
  type UiChatMessage,
  uiChatResource,
} from '@hashbrownai/angular';
import {
  AircraftCompareComponent,
  AircraftCompareFallbackComponent,
} from './components/aircraft-compare';
import {
  ArrivalsBoardComponent,
  ArrivalsBoardFallbackComponent,
} from './components/arrivals-board';
import {
  FlightCardComponent,
  FlightCardFallbackComponent,
} from './components/flight-card';
import { AutoScrollDirective } from './auto-scroll';
import { ComposerComponent } from './composer';
import { EmptyStateComponent } from './empty-state';
import { ATC_STORE } from './store';
import { TranscriptComponent } from './transcript';

// 1. Expose your components. The model can only render these, and Skillet
//    validates every input. IDs never stream, so a card never shows the wrong plane.
const components = [
  exposeMarkdown({ className: 'atc-prose' }),
  exposeComponent(FlightCardComponent, {
    name: flightCardContract.name,
    description: flightCardContract.description,
    input: flightCardContract.props,
    fallback: FlightCardFallbackComponent,
    children: false,
  }),
  exposeComponent(ArrivalsBoardComponent, {
    name: arrivalsBoardContract.name,
    description: arrivalsBoardContract.description,
    input: arrivalsBoardContract.props,
    fallback: ArrivalsBoardFallbackComponent,
    children: false,
  }),
  exposeComponent(AircraftCompareComponent, {
    name: aircraftCompareContract.name,
    description: aircraftCompareContract.description,
    input: aircraftCompareContract.props,
    fallback: AircraftCompareFallbackComponent,
    children: false,
  }),
];

/** The chat panel: components, browser-side tools and the streaming answer. */
@Component({
  selector: 'atc-assistant',
  imports: [
    AutoScrollDirective,
    ComposerComponent,
    EmptyStateComponent,
    TranscriptComponent,
  ],
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
          <button
            type="button"
            (click)="chat.reload() || chat.resendMessages()"
          >
            Retry
          </button>
        </div>
      }
    </div>
    <atc-composer [busy]="chat.isLoading()" (send)="send($event)" />
  `,
})
export class Assistant {
  private readonly atc = createAtcTools({
    store: inject(ATC_STORE),
    fetchRoute,
  });

  // 2. Give the model tools. They run here in the browser, against the aircraft
  //    already on the map; no plane list goes to the server.
  // 3. Render the stream. The system prompt is pinned on the server.
  protected readonly chat = uiChatResource({
    system: 'Provided by the server.',
    components,
    tools: [
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
    ],
  });

  // Keep the last good transcript while the chat is in error, so Retry has context.
  protected readonly messages = linkedSignal({
    source: () => (this.chat.status() === 'error' ? null : this.chat.value()),
    computation: (value, prev): UiChatMessage[] => value ?? prev?.value ?? [],
  });
  protected readonly items = computed(() => transcriptItems(this.messages()));

  protected send(content: string): void {
    this.chat.sendMessage({ role: 'user', content });
  }
}
