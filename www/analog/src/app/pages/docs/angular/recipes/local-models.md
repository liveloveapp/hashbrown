---
title: 'Local Browser Models (Chrome & Edge)'
meta:
  - name: description
    content: "Use Hashbrown's experimental local transport to target Gemini Nano in Chrome or Phi-4-mini in Edge, with automatic fallback to cloud models when needed."
---

# Local Models (Chrome + Edge)

<p class="subtitle">Ship AI features that stay on the user's device and fall back to the network when needed.</p>

What you'll learn:

1. Enable the built-in models in Chrome or Edge (flags, hardware, languages)
2. Wire Hashbrown's `experimental_local` model spec with cloud fallbacks
3. Show download/availability state to the user
4. Keep structured outputs working without tool calls

---

## 0. Why local models?

- **Privacy + offline**: Prompts never leave the device and keep working without network after the initial download.
- **Zero per-request cost**: No API key or usage billing; the browser ships the model.
- **Low latency**: Tokens stream from the local runtime without a network request.

---

## 1. Prerequisites and flags (as of Dec 14, 2025)

| Browser              | Languages                | System Requirements                           | Flags to enable                                                                                |
| -------------------- | ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chrome - Gemini Nano | en, es, ja               | >=22 GB disk; >4 GB VRAM or 16 GB RAM/4 cores | `optimization-guide-on-device-model`, `prompt-api-for-gemini-nano` (or `...-multimodal-input`) |
| Edge - Phi-4-mini    | en (others experimental) | >=5.5 GB VRAM or strong CPU                   | `prompt-api-for-phi-mini`                                                                      |

After toggling flags, restart the browser and run `await LanguageModel.availability();` in DevTools to confirm readiness. Localhost does not require an origin trial.

---

## 2. Hashbrown building blocks

- `experimental_local()` (in **@hashbrownai/core**): a model spec that tries **Chrome first, then Edge** by default.
- Adapters:
  - Chrome -> `ExperimentalChromeLocalTransport` (Gemini Nano)
  - Edge -> `ExperimentalEdgeLocalTransport` (Phi-4-mini)
- Fallback chaining: pass an array of model specs to your Angular resource; Hashbrown will advance when local is **feature- or platform-unsupported** but will **not** auto-advance on generation errors (retries stay on the chosen adapter).

---

## 3. Quickstart: local-first structured completion

This component streams a travel itinerary schema. It shows availability/download UI while preferring the on-device model and falls back to `gpt-5-mini` automatically.

<hb-code-example header="local-itinerary.component.ts">

```ts
import { Component, computed, effect, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { experimental_local } from '@hashbrownai/core/transport';

const ItinerarySchema = s.object('2-day plan', {
  city: s.string('Destination city'),
  days: s.streaming.array(
    'List of days',
    s.object('Day', {
      title: s.streaming.string('Title'),
      highlights: s.streaming.array(
        'Top things to do',
        s.streaming.string('Activity'),
      ),
    }),
  ),
});

@Component({
  selector: 'app-local-itinerary',
  imports: [JsonPipe],
  template: `
    <div class="status">
      <p>Availability: {{ status() ?? 'checking...' }}</p>
      @if (downloadRequired()) {
        <p>Download required (triggered on first prompt)</p>
      }
      @if (downloadProgress() !== null) {
        <p>Download: {{ downloadProgress() }}%</p>
      }
    </div>

    <label>
      Destination
      <input
        type="text"
        [value]="destination()"
        (input)="destination.set(($event.target as HTMLInputElement).value)"
      />
    </label>

    @if (itinerary.value()) {
      <pre>{{ itinerary.value() | json }}</pre>
    }
    @if (itinerary.error()) {
      <p>Error: {{ itinerary.error()?.message }}</p>
    }
  `,
})
export class LocalItinerary {
  destination = signal('Lisbon');
  status = signal<string | null>(null);
  downloadProgress = signal<number | null>(null);
  downloadRequired = signal<unknown>(null);

  itinerary = structuredCompletionResource({
    model: [
      experimental_local({
        events: {
          availability: (s) => this.status.set(s),
          downloadRequired: (s) => this.downloadRequired.set(s),
          downloadProgress: (pct) => this.downloadProgress.set(pct),
        },
      }),
      'gpt-5-mini', // fallback if local is unsupported/unavailable
    ],
    schema: ItinerarySchema,
    system: 'Return a concise two-day itinerary as JSON.',
    input: computed(() => `Plan a two-day visit to ${this.destination()}.`),
  });

  constructor() {
    effect(() => {
      if (this.itinerary.error()) {
        console.error('Structured completion error', this.itinerary.error());
      }
    });
  }
}
```

</hb-code-example>

**How it works**

- `experimental_local` selects Chrome or Edge once per session.
- If the request includes tools, the local adapter throws `FEATURE_UNSUPPORTED`, and Hashbrown advances to `gpt-5-mini`.
- `events` let you mirror download UX (`downloadRequired`, `downloadProgress`) without blocking the call; Chrome/Edge handle the download after a user gesture.

---

## 4. Structured output on-device

Both transports forward Hashbrown's `responseFormat` to each browser's `responseConstraint`:

- Keep schemas small; models are SLMs.
- Schemas support the `streaming` keyword letting you eagerly parse JSON as it is being generated.

---

## 5. Availability & download UX patterns

- **Preflight**: call `LanguageModel.availability()` in a `requestIdleCallback` to prime status indicators. Chrome/Edge return `downloadable`/`downloading` while the model fetches (~2-3 GB).
- **Consent gate**: bind `downloadRequired` to a "Download model" button; trigger the first prompt from that click so the browser can start downloading.
- **Progress**: use `downloadProgress` from the transport monitor; show percentage and keep the request pending (Hashbrown streams once the download finishes).

---

## 6. Capability and fallback matrix

- **Tools**: not supported locally; expect `FEATURE_UNSUPPORTED`.
- **Structured**: supported when schema is compatible.
- **UI**: Simple user interfaces can be generated. Avoid using `children: 'any'` to prevent cycles in the underlying UI schema. Provide examples using the `prompt` helper.

---

## 7. Troubleshooting

- `PLATFORM_UNSUPPORTED`: API missing (wrong channel/flag), unsupported language, or disallowed context (service worker). Switch channel or disable the local spec.
- `FEATURE_UNSUPPORTED`: tools requested, or schema not supported-ensure you have a fallback HTTP model in the array.
- Slow first token: the model may still be downloading; keep showing progress events.
- Storage reclaimed (<10 GB free on profile volume) will evict the model; Chrome re-downloads on the next prompt.
