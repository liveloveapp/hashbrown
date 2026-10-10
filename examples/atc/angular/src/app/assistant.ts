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
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  createTool,
  exposeComponent,
  exposeMarkdown,
  RenderMessageComponent,
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
import { ATC_STORE } from './store';

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

/** The overlay chat: components, browser-side tools and the streaming answer. */
@Component({
  selector: 'atc-assistant',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-assistant', role: 'region', 'aria-label': 'Assistant' },
  template: `
    <ol class="atc-transcript">
      @for (message of messages(); track $index) {
        @if (message.role === 'user') {
          <li class="atc-user">{{ text(message.content) }}</li>
        } @else if (message.role === 'assistant') {
          @if (message.content?.ui?.length) {
            <li><hb-render-message [message]="message" /></li>
          }
        }
      }
    </ol>
    @if (chat.error()) {
      <p class="atc-error" role="alert">
        Something went wrong.
        <button type="button" (click)="chat.reload()">Retry</button>
      </p>
    } @else if (messages().length === 0) {
      <div class="atc-starters">
        @for (prompt of starters; track prompt) {
          <button type="button" (click)="send(prompt)">{{ prompt }}</button>
        }
      </div>
    }
    <form class="atc-composer" (submit)="onSubmit($event)">
      <input
        aria-label="Message"
        placeholder="Ask about the planes on the map"
        [value]="draft()"
        (input)="onInput($event)"
      />
      <button type="submit" [disabled]="chat.isLoading()">Send</button>
    </form>
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

  protected readonly messages = computed(() =>
    this.chat.status() === 'error' ? [] : this.chat.value(),
  );
  protected readonly draft = signal('');
  protected readonly starters = STARTER_PROMPTS;
  protected readonly text = messageText;

  protected send(text: string): void {
    const content = text.trim();
    if (content) {
      this.chat.sendMessage({ role: 'user', content });
      this.draft.set('');
    }
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.send(this.draft());
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
}
