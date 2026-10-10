import {
  aircraftCompareContract,
  arrivalsBoardContract,
  createAtcTools,
  fetchRoute,
  flightCardContract,
  messageText,
} from '@atc/shared';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
} from '@angular/core';
import {
  createTool,
  exposeComponent,
  exposeMarkdown,
  RenderMessageComponent,
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
import { ComposerComponent } from './composer';
import { EmptyStateComponent } from './empty-state';
import { ATC_STORE } from './store';
import { ToolChipsComponent } from './tool-chips';

// 1. Expose your components. The model can only render these, and Skillet
//    validates every input. IDs never stream, so a card never shows the wrong plane.
const components = [
  exposeMarkdown(),
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
    ComposerComponent,
    EmptyStateComponent,
    RenderMessageComponent,
    ToolChipsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-chat', role: 'region', 'aria-label': 'Assistant' },
  template: `
    <div class="atc-chat-body">
      @if (messages().length === 0 && !chat.error()) {
        <atc-empty-state (pick)="send($event)" />
      }
      <ol class="atc-transcript">
        @for (message of messages(); track $index) {
          @if (message.role === 'user') {
            <li class="atc-user">{{ text(message.content) }}</li>
          } @else if (message.role === 'assistant') {
            @if (message.toolCalls.length) {
              <li>
                <atc-tool-chips
                  [calls]="message.toolCalls"
                  [busy]="chat.isLoading()"
                />
              </li>
            }
            @if (message.content?.ui?.length) {
              <li><hb-render-message [message]="message" /></li>
            }
          }
        }
      </ol>
      @if (chat.error()) {
        <p class="atc-error" role="alert">
          Something went wrong.
          <button
            type="button"
            (click)="chat.reload() || chat.resendMessages()"
          >
            Retry
          </button>
        </p>
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
    ],
  });

  // Keep the last good transcript while the chat is in error, so Retry has context.
  protected readonly messages = linkedSignal({
    source: () => (this.chat.status() === 'error' ? null : this.chat.value()),
    computation: (value, prev): UiChatMessage[] => value ?? prev?.value ?? [],
  });
  protected readonly text = messageText;

  protected send(content: string): void {
    this.chat.sendMessage({ role: 'user', content });
  }
}
