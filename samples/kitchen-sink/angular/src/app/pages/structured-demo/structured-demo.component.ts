import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { structuredCompletionResource } from '@hashbrownai/angular';
import {
  experimental_chrome,
  experimental_edge,
  experimental_local,
  s,
} from '@hashbrownai/core';

const itinerarySchema = s.object('Weekend itinerary', {
  title: s.streaming.string('Short title for the plan'),
  summary: s.streaming.string('One sentence summary'),
  stops: s.streaming.array(
    'Stops on the trip',
    s.object('Destination', {
      name: s.streaming.string('Name of the stop'),
      description: s.streaming.string('What happens here'),
      durationHours: s.number('Approximate time spent at the stop'),
    }),
  ),
});

@Component({
  selector: 'app-structured-demo',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="structured-demo">
      <header>
        <h1>Structured Completion Demo</h1>
        <p>
          This page uses the Angular
          <code>structuredCompletionResource</code> to generate a typed
          itinerary JSON object. It exercises the new transport wiring, so
          swapping to a custom transport is as easy as passing the option into
          the resource factory.
        </p>
      </header>

      <pre>
      status = {{ status() }};
      downloadProgress = {{ downloadProgress() }};
      downloadRequired = {{ downloadRequired() }};
      sessionState = {{ sessionState() }};
      </pre
      >

      <form>
        <label for="destination">Where would you like to go?</label>
        <input
          id="destination"
          type="text"
          [(ngModel)]="destination"
          name="destination"
          placeholder="e.g. Portland with kids"
        />

        <label for="style">Any special requests?</label>
        <textarea
          id="style"
          rows="3"
          [(ngModel)]="style"
          name="style"
          placeholder="Outdoor activities, local food, etc."
        ></textarea>
      </form>

      @if (itinerary.value()) {
        @let plan = itinerary.value();
        <section class="results">
          @if (plan) {
            <article>
              <h2>{{ plan.title }}</h2>
              <p class="summary">{{ plan.summary }}</p>

              <ol>
                @for (stop of plan.stops; track stop.name) {
                  <li>
                    <div class="stop">
                      <h3>{{ stop.name }}</h3>
                      <p>{{ stop.description }}</p>
                      <p class="duration">~{{ stop.durationHours }} hours</p>
                    </div>
                  </li>
                }
              </ol>
            </article>
          } @else {
            <ng-template #idle>
              <p class="hint">Describe a destination to create a plan.</p>
            </ng-template>
          }
        </section>
      }

      @if (itinerary.value()) {
        @let raw = itinerary.value();
        <section class="raw">
          <h3>Raw JSON</h3>
          <pre>{{ raw | json }}</pre>
        </section>
      }
    </section>
  `,
  styles: `
    .structured-demo {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 24px;
      max-width: 720px;
    }

    form {
      display: grid;
      gap: 12px;
    }

    input,
    textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 16px;
      font-family: inherit;
    }

    button {
      padding: 12px 16px;
      border-radius: 6px;
      border: none;
      font-size: 16px;
      font-weight: 600;
      background: #111827;
      color: #fff;
      cursor: pointer;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .results {
      border-top: 1px solid #eee;
      padding-top: 16px;
    }

    .stop {
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      background: #fff;
    }

    .summary {
      font-style: italic;
      color: #4b5563;
    }

    .duration {
      color: #6b7280;
      font-size: 14px;
    }

    .raw pre {
      background: #0f172a;
      color: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      white-space: pre-wrap;
    }
  `,
})
export class StructuredDemoComponent {
  destination = signal('Portland');
  style = signal('Family-friendly, mix of nature and food.');

  status = signal<any>(null);
  downloadProgress = signal<any>(null);
  downloadRequired = signal<any>(null);
  sessionState = signal<any>(null);

  itinerary = structuredCompletionResource({
    model: [
      experimental_local({
        events: {
          availability: (status) => this.status.set(status),
          downloadProgress: (percent) => this.downloadProgress.set(percent),
          downloadRequired: (status) => this.downloadRequired.set(status),
          sessionState: (state) => this.sessionState.set(state),
        },
      }),
      'gpt-5-mini',
    ],
    schema: itinerarySchema,
    system: `You are a travel assistant returning JSON that matches the schema strictly.`,
    input: computed(
      () =>
        `Create a two-day itinerary for ${this.destination()}. ${this.style()}`,
    ),
    debugName: 'structured-demo',
  });

  constructor() {
    effect(() => {
      if (this.itinerary.error()) {
        console.error('Structured completion error', this.itinerary.error());
      }
    });
  }
}
