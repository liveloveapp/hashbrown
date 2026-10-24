---
title: 'Local Browser Models (Chrome & Edge)'
meta:
  - name: description
    content: "Use Hashbrown's experimental local transport to target Gemini Nano in Chrome or Phi-4-mini in Edge."
---

# Local Models (Chrome + Edge)

<p class="subtitle">Ship AI features that stay on the user's device.</p>

What you'll learn:

1. Enable the built-in models in Chrome or Edge (flags, hardware, languages)
2. Configure Hashbrown's `experimental_local` transport
3. Show download/availability state to the user
4. Keep structured outputs working without tool calls

---

## 0. Why local models?

- **Privacy + offline**: Prompts never leave the device and keep working without network after the initial download.
- **Zero per-request cost**: No API key or usage billing; the browser ships the model.
- **Low latency**: Tokens stream from the local runtime without a network request.

---

## 1. Browser prerequisites (October 2026)

Chrome's Prompt API is available for websites from Chrome 148 and extensions from Chrome 138. It uses Gemini Nano and supports text output in English, Spanish, Japanese, German, and French. Availability depends on the device, browser policy, model installation, and requested languages. Check `LanguageModel.availability()` rather than relying on the browser version alone.

Chrome requires desktop hardware with at least 22 GB free profile-volume space and either more than 4 GB VRAM or at least 16 GB RAM and four CPU cores. See the [current Chrome requirements](https://developer.chrome.com/docs/ai/prompt-api) for platform details.

Edge's Prompt API remains a developer preview in Canary and Dev. It uses Phi-4-mini by default, with a prerelease Aion model available on supported versions. See [Microsoft's setup instructions](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api).

Use HTTPS or localhost. Start the first generation from a user interaction if the model needs downloading. Availability is a string: `unavailable`, `downloadable`, `downloading`, or `available`. Native browser models are managed by the browser; applications cannot select arbitrary weights through this API.

---

## 2. Hashbrown building blocks

- `experimental_local()` (in **@hashbrownai/core**): a transport factory that tries **Chrome first, then Edge** by default.
- Adapters:
  - Chrome -> `ExperimentalChromeLocalTransport` (Gemini Nano)
  - Edge -> `ExperimentalEdgeLocalTransport` (Phi-4-mini)
- Configure the resource's `transport` option with the factory. Provider and model selection for HTTP requests remains on the server.

---

## 3. Quickstart: local-first structured completion

This component streams a travel itinerary schema from an on-device model and shows availability and download state.

<hb-code-example header="local-itinerary.component.ts">

```ts
import { Component, signal } from '@angular/core';
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

    <button (click)="generate()" [disabled]="itinerary.isLoading()">
      Generate locally
    </button>

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
  submitted = signal<string | null>(null);
  status = signal<string | null>(null);
  downloadProgress = signal<number | null>(null);
  downloadRequired = signal<unknown>(null);

  itinerary = structuredCompletionResource({
    transport: experimental_local({
      events: {
        availability: (s) => this.status.set(s),
        downloadRequired: (s) => this.downloadRequired.set(s),
        downloadProgress: (pct) => this.downloadProgress.set(pct),
      },
    }),
    schema: ItinerarySchema,
    system: 'Return a concise two-day itinerary as JSON.',
    input: this.submitted,
  });

  generate() {
    const prompt = `Plan a two-day visit to ${this.destination()}.`;
    if (this.submitted() === prompt) this.itinerary.reload();
    else this.submitted.set(prompt);
  }
}
```

</hb-code-example>

**How it works**

- `experimental_local` tries native Prompt API adapters. Both browsers expose `LanguageModel`, so adapter names do not identify the browser or select its model. For a known target, use `experimental_chrome()` or `experimental_edge()` explicitly.
- If the request includes tools, the local adapter reports `FEATURE_UNSUPPORTED` because these local adapters do not support Hashbrown tools.
- `events` let you mirror download UX (`downloadRequired`, `downloadProgress`) without blocking the call; Chrome/Edge handle the download after a user gesture.

---

## 4. Structured output on-device

Both transports forward Hashbrown's response schema to each browser's `responseConstraint`:

- Keep schemas small; models are SLMs.
- Skillet streaming annotations control incremental parsing in Hashbrown. The browser receives JSON Schema through `responseConstraint`; validate your actual schema with the chosen browser model.

---

## 5. Availability & download UX patterns

- **Preflight**: call `LanguageModel.availability()` in a `requestIdleCallback` to prime status indicators. Chrome/Edge return `downloadable` or `downloading` before the model is ready. Download sizes vary with the browser-managed model.
- **Consent gate**: bind `downloadRequired` to a "Download model" button; trigger the first prompt from that click so the browser can start downloading.
- **Progress**: use `downloadProgress` from the transport monitor; show percentage and keep the request pending (Hashbrown streams once the download finishes).

---

## 6. Capability and fallback matrix

- **Tools**: not supported locally; expect `FEATURE_UNSUPPORTED`.
- **Structured**: supported when schema is compatible.
- **UI**: Simple user interfaces can be generated. Avoid using `children: 'any'` to prevent cycles in the underlying UI schema. Keep the component set small, give each component a description that says when to use it and when not to, and put layout rules in a short plain-string system prompt.

---

## 7. Troubleshooting

- `PLATFORM_UNSUPPORTED`: API missing (wrong channel/flag), unsupported language, or disallowed context (service worker). Switch channel or use the default HTTP transport instead.
- `FEATURE_UNSUPPORTED`: tools were requested or the schema is not supported. Use an AG-UI HTTP endpoint for that feature.
- Slow first token: the model may still be downloading; keep showing progress events.
- Storage reclaimed (<10 GB free on profile volume) will evict the model; Chrome re-downloads on the next prompt.

## Explicit Chrome image and audio input

Use `experimental_chrome` for media. Media is off by default; enable each input
kind and provide an application resolver. The resolver receives an AG-UI
`ImagePart` or `AudioPart` plus the run's `AbortSignal`, and returns an encoded
`Blob` and an optional `dispose` callback. This example accepts inline base64
only. URL and provider file handles require your application's explicit
resolution policy; Hashbrown does not fetch them.

```ts
import { Component, input } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { experimental_chrome } from '@hashbrownai/core';

const transport = experimental_chrome({
  outputLanguage: 'en',
  media: {
    images: {},
    inputLanguages: ['en'],
    resolve(part, { signal }) {
      signal.throwIfAborted();
      if (part.source.type !== 'data') {
        throw new Error('This application accepts inline media only.');
      }
      const bytes = Uint8Array.from(atob(part.source.value), (c) =>
        c.charCodeAt(0),
      );
      return { blob: new Blob([bytes], { type: part.source.mimeType }) };
    },
  },
});

@Component({
  selector: 'app-local-image',
  template: `
    <button (click)="send()">Describe image</button>
    <p>{{ chat.lastAssistantMessage()?.content }}</p>
    @if (chat.error()) {
      <p>{{ chat.error()?.message }}</p>
    }
  `,
})
export class LocalImage {
  readonly base64 = input.required<string>();
  readonly chat = chatResource({
    transport,
    system: 'Describe the supplied image.',
  });

  send(): void {
    this.chat.sendMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'What is the dominant color?' },
        {
          type: 'image',
          source: { type: 'data', value: this.base64(), mimeType: 'image/png' },
        },
      ],
    });
  }
}
```

AG-UI inline sources use `{ type: 'data', value: base64, mimeType }`; `value`
contains canonical base64 bytes, without a `data:` URL prefix. Keep media in
user messages. Canonical AG-UI content parts survive message lowering and immutable
history snapshots; ordinary JSON arrays keep their legacy representation. The
transport preserves part order, validates and decodes images
before creating a session, and releases its ImageBitmaps and resolver cleanup
callbacks when each run settles, including errors and cancellation. Each media
run gets its own native session. Replayed history is resolved again.

`media.inputLanguages` defaults to `['en']` and describes input independently
of `outputLanguage`. The transport checks the exact requested input modalities
and languages. Missing or unknown availability fails closed. A downloadable or
downloading model requires an explicit `events.downloadRequired` callback;
without it, media requests fail before creation. Prepare downloads through your
application's user-initiated flow and retain Chrome's activation requirements.

Image input accepts PNG, JPEG and WebP, with defaults of 10 MiB encoded bytes
and 16 million decoded pixels per image (`images.maxBytes`, `images.maxPixels`).
Audio is a separate opt-in: add `audio: { maxBytes: 10 * 1024 * 1024,
maxDurationSeconds: 30 }` to `media`, then send an `audio` part with the same
source shape and `mimeType: 'audio/wav'`. Only encoded PCM16 RIFF WAV with one
or two channels and an 8–48 kHz sample rate is supported. The transport preserves
that encoding and sample rate. Defaults are 10 MiB and 30 seconds per audio
part; `media.maxTotalBytes` defaults to 20 MiB across the run's media history.
Raw PCM, video, documents, media tool results and `media` combined with
`transformRequest` are unsupported.

Native typed tools remain unsupported by Hashbrown. Under Chrome 155's normal
feature defaults the typed interfaces are absent. The [official experimental
tool-use flag](https://chrome.dev/web-ai-demos/prompt-api-tool-use/) exposes the
interfaces and recognizes declarations, but selects a v4 model that is
`downloadable` in the tested dedicated profile. No download or tool inference
was attempted. This interface check used the installed browser without an
origin-trial token; a real typed call/result round trip remains unverified.
The retained interface target passed two checks with `downloadable` status and
no model creation. A v4 model download needs explicit authorization before
actual typed inference. Accepted options alone do not establish working tools. Chrome 155 has transcribed the retained generated speech
fixture through its raw native API. The real Hashbrown media suite also passed
all four Angular/React image/audio cases, with one resolution, disposal, session
creation and session destruction per run. The deterministic shim suite checks transport and framework
contracts, separately from real inference. See the [local conformance commands](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance#local-model-suites).

## Application-owned WebLLM engines

Use `experimental_webllm({ engine })` when the application wants to select and manage its own browser model. Hashbrown does not import WebLLM or declare it as a dependency or peer dependency. Install WebLLM in the consuming application only. The adapter's structural API has been type-checked against WebLLM 0.2.85, including worker engines.

Create the worker in the application:

```ts
// local-worker.ts
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => handler.onmessage(event);
```

Prepare a model in a user-initiated action, then retain the resulting transport:

```ts
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { experimental_webllm } from '@hashbrownai/core';

const worker = new Worker(new URL('./local-worker.ts', import.meta.url), {
  type: 'module',
});
const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
  initProgressCallback: (progress) => console.log(progress.text),
});
const transport = experimental_webllm({ engine });
```

Pass `transport` to `provideHashbrown({ transport })` or an individual resource's options.

The application owns model selection, downloads, worker creation, caching, and unloading. Stop active Hashbrown runs before calling `engine.unload()` and terminating the worker. The transport supports text, structured output, and trusted UI; it rejects tools and multimodal messages. Keep UI kits and schemas small, and test nested schemas on the real model.

Hashbrown converts the response schema to WebLLM's `json_object` format with a JSON-encoded `schema` string. This differs from OpenAI's `json_schema` wrapper. A truncated response raises `WEBLLM_OUTPUT_TRUNCATED` rather than completing successfully with partial JSON.

Only one Hashbrown run may reserve a given engine at a time, including across transport instances. Overlap fails with `MODEL_BUSY`. Do not invoke that engine directly while Hashbrown owns a run. Cancellation interrupts the active generation without unloading the engine; a late setup or interrupted stream keeps the reservation until it drains through completion. The UI can stop before draining finishes, so an immediate replacement run may briefly receive `MODEL_BUSY`. An ignored or abandoned transport response must be disposed.

Local inference does not enable a hosted fallback automatically. Keep permission to send prompts off-device an explicit application choice. Model downloads and application telemetry have their own network behavior; local generation alone does not make the entire application offline.

The local-only real-worker suite checks structured output, nested trusted UI, and generation after Stop or token-limit truncation. The separate aimock suite checks transport contracts without downloading models. See the [conformance test commands](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance#local-model-suites) to run either locally; these suites reject CI execution.
