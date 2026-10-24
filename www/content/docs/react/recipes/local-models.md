---
title: 'Local Browser Models (Chrome & Edge)'
meta:
  - name: description
    content: "Run Hashbrown on Chrome's Gemini Nano or Edge's Phi-4-mini using the experimental_local transport."
---

# Local Models (Chrome + Edge)

<p class="subtitle">Ship AI features that stay on the user's device.</p>

What you'll learn:

1. Enable the built-in models in Chrome or Edge (flags, hardware, languages)
2. Configure `experimental_local` as a React hook transport
3. Surface download/availability state in your UI
4. Keep structured outputs working without tool calls

---

## 0. Why local models?

- **Privacy + offline**: prompts never leave the device once the model is downloaded.
- **Zero per-request cost**: no API key usage while the browser model is used.
- **Low latency**: tokens stream locally through the same AG-UI event lifecycle used by HTTP transports.

---

## 1. Browser prerequisites (October 2026)

Chrome's Prompt API is available for websites from Chrome 148 and extensions from Chrome 138. It uses Gemini Nano and supports text output in English, Spanish, Japanese, German, and French. Availability depends on the device, browser policy, model installation, and requested languages. Check `LanguageModel.availability()` rather than relying on the browser version alone.

Chrome requires desktop hardware with at least 22 GB free profile-volume space and either more than 4 GB VRAM or at least 16 GB RAM and four CPU cores. See the [current Chrome requirements](https://developer.chrome.com/docs/ai/prompt-api) for platform details.

Edge's Prompt API remains a developer preview in Canary and Dev. It uses Phi-4-mini by default, with a prerelease Aion model available on supported versions. See [Microsoft's setup instructions](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api).

Use HTTPS or localhost. Start the first generation from a user interaction if the model needs downloading. Availability is a string: `unavailable`, `downloadable`, `downloading`, or `available`. Native browser models are managed by the browser; applications cannot select arbitrary weights through this API.

---

## 2. Hashbrown building blocks

- `useStructuredCompletion` from `@hashbrownai/react` to stream typed outputs.
- `experimental_local()` from `@hashbrownai/core/transport` tries Chrome first, then Edge.
- Pass the factory through a hook's `transport` option. Provider and model selection for HTTP requests remains on the server.
- Event hooks (`availability`, `downloadRequired`, `downloadProgress`) let you mirror browser download state in React state.

---

## 3. Quickstart: local-first structured completion

This component streams a two-day itinerary schema from an on-device model.

<hb-code-example header="LocalItinerary.tsx">

```tsx
import { useState } from 'react';
import { s } from '@hashbrownai/core';
import { experimental_local } from '@hashbrownai/core/transport';
import { useStructuredCompletion } from '@hashbrownai/react';

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

export function LocalItinerary() {
  const [city, setCity] = useState('Lisbon');
  const [availability, setAvailability] = useState<string | null>(null);
  const [downloadRequired, setDownloadRequired] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const [submittedCity, setSubmittedCity] = useState<string | null>(null);
  const input = submittedCity
    ? `Plan a concise two-day itinerary for ${submittedCity}.`
    : null;

  const { output, error, isSending, reload } = useStructuredCompletion({
    debugName: 'local-itinerary-react',
    input,
    system: 'Return a two-day itinerary as JSON that matches the schema.',
    schema: ItinerarySchema,
    transport: experimental_local({
      events: {
        availability: setAvailability,
        downloadRequired: () => setDownloadRequired(true),
        downloadProgress: setDownloadProgress,
      },
    }),
  });

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600 }}>Destination</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Lisbon"
        />
      </div>

      <div style={{ fontSize: 14, color: '#555' }}>
        <div>Availability: {availability ?? 'checking...'}</div>
        {downloadRequired && (
          <div>Download required (triggered on first prompt)</div>
        )}
        {downloadProgress !== null && <div>Download: {downloadProgress}%</div>}
      </div>

      <button
        onClick={() =>
          submittedCity === city ? reload() : setSubmittedCity(city)
        }
        disabled={isSending}
      >
        {isSending ? 'Generating...' : 'Generate locally'}
      </button>

      {output && (
        <pre style={{ background: '#0f172a', color: '#f8fafc', padding: 12 }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )}

      {error && <div style={{ color: 'crimson' }}>Error: {error.message}</div>}
    </section>
  );
}
```

</hb-code-example>

**How it works**

- `experimental_local` creates a transport that releases its browser session when the response finishes; events keep your UI in sync with download state.
- If tools are requested, local reports `FEATURE_UNSUPPORTED` because these local adapters do not support Hashbrown tools.
- `reload` lets users retry after enabling flags or freeing disk space without remounting the component.

---

## 4. Troubleshooting (React focus)

- `PLATFORM_UNSUPPORTED`: API missing, wrong browser channel, or flags off. Re-check the table above.
- `FEATURE_UNSUPPORTED`: tools were requested or the schema is unsupported. Use an AG-UI HTTP endpoint for that feature.
- Slow first token: the model may still be downloading; keep surfacing `downloadProgress`.
- Model evicted because of low disk: rerun with `reload` after the browser re-downloads the model.

## Explicit Chrome image and audio input

Use `experimental_chrome` for media. Media is off by default; enable each input
kind and provide an application resolver. The resolver receives an AG-UI
`ImagePart` or `AudioPart` plus the run's `AbortSignal`, and returns an encoded
`Blob` and an optional `dispose` callback. This example accepts inline base64
only. URL and provider file handles require your application's explicit
resolution policy; Hashbrown does not fetch them.

```tsx
import { experimental_chrome } from '@hashbrownai/core';
import { useChat } from '@hashbrownai/react';

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

export function LocalImage({ base64 }: { base64: string }) {
  const chat = useChat({ transport, system: 'Describe the supplied image.' });
  return (
    <section>
      <button
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: [
              { type: 'text', text: 'What is the dominant color?' },
              {
                type: 'image',
                source: { type: 'data', value: base64, mimeType: 'image/png' },
              },
            ],
          })
        }
      >
        Describe image
      </button>
      <p>{chat.lastAssistantMessage?.content}</p>
      {chat.error && <p>{chat.error.message}</p>}
    </section>
  );
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

Pass `transport` to `<HashbrownProvider transport={transport}>` or an individual hook's options.

The application owns model selection, downloads, worker creation, caching, and unloading. Stop active Hashbrown runs before calling `engine.unload()` and terminating the worker. The transport supports text, structured output, and trusted UI; it rejects tools and multimodal messages. Keep UI kits and schemas small, and test nested schemas on the real model.

Hashbrown converts the response schema to WebLLM's `json_object` format with a JSON-encoded `schema` string. This differs from OpenAI's `json_schema` wrapper. A truncated response raises `WEBLLM_OUTPUT_TRUNCATED` rather than completing successfully with partial JSON.

Only one Hashbrown run may reserve a given engine at a time, including across transport instances. Overlap fails with `MODEL_BUSY`. Do not invoke that engine directly while Hashbrown owns a run. Cancellation interrupts the active generation without unloading the engine; a late setup or interrupted stream keeps the reservation until it drains through completion. The UI can stop before draining finishes, so an immediate replacement run may briefly receive `MODEL_BUSY`. An ignored or abandoned transport response must be disposed.

Local inference does not enable a hosted fallback automatically. Keep permission to send prompts off-device an explicit application choice. Model downloads and application telemetry have their own network behavior; local generation alone does not make the entire application offline.

The local-only real-worker suite checks structured output, nested trusted UI, and generation after Stop or token-limit truncation. The separate aimock suite checks transport contracts without downloading models. See the [conformance test commands](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance#local-model-suites) to run either locally; these suites reject CI execution.
