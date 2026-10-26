# Default Nano qualification

Status: the user authorized downloading and qualifying Chrome's default Nano
route after Gemma E4B. The downloaded manifest identifies `v3Nano`, base
`2025.06.30.1229`, component `2025.8.8.1141`. Its weights are 4,269,932,544 bytes.
The manifest exposes no parameter count, so this is not proof of a specifically
selectable Gemini Nano 4B model. The [Chrome 155 create-options IDL](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/third_party/blink/renderer/modules/ai/language_model_create_options.idl)
has no application model-name/parameter selector.

## Model and browser configuration

Chrome Stable 155.0.8059.85, macOS 26.5, M1 Max, 32 GB, dedicated test profile
`/tmp/hashbrown-native-tools-model-profile`. Model manifest path:
`OptGuideOnDeviceModel/2025.8.8.1141/manifest.json`.
Existing Gemma2B/E4B components are retained separately. Same-device evidence
only; cross-hardware remains deferred.

`LOCAL_LLM_CHROME_MODEL_VERSION=default` omits the foundational-model override.
Ordinary text/media/UI tests restore normal Chrome features; the typed-tool
probe additionally enables `AIPromptAPIToolUse,OnDeviceModelConversationBackend`.
That tool experiment deliberately differs from the stock chrome://flags tool
bundle, which also selects v4/Gemma 2B. Actual flags are retained per report.

## Typed tools: creation gate fails

One strict raw success probe permitted the approved acquisition via an actual
button click. Total case time was 718.7 seconds including model acquisition and
failed creation. It failed with InvalidStateError before obtaining a session,
emitting a native call, or executing a handler. Acquired/destroyed counts were
both zero; no ID normalization or model-output repair was attempted.

After download, both read-only framework capability probes recognized the tools
dictionary and reported available for exact typed-tool options. This establishes
interface/assets readiness, not successful session creation or tool inference.
The downstream raw replay/tool/schema/phase suites were not run after this gate
failed. Default Nano native tools and tool-plus-UI remain unqualified.

## Working ordinary text/UI/media paths

With ordinary Chrome defaults, no explicit tool/conversation feature overrides,
no tools declared and downloads refused:

- The complete no-tools smoke suite passed 6/6: two structured fixture cases and
  four exact raw-JSON/rendered leaf/nested UI cases across Angular and React.
  Structured cases require requested answer text and exact count, not exact raw
  structured JSON. UI cases enforce cardinality/order/props/heading, no tools,
  balanced sessions, no active readers/page errors/configured HTTP fallback.
- Image/audio framework suite passed 4/4 using only a generated red PNG and
  repository synthetic speech WAV. Existing semantic assertions and resource
  disposal remain unchanged. No microphone/camera/personal media was used.
- No tests were skipped, retried unchanged, or reclassified as expected failures.

These results qualify these fixed fixtures on this browser/model/device; they do
not establish general image/audio quality, arbitrary UI composition, another
language/corpus, browser or hardware reliability. Availability alone remains
insufficient to advertise native tool support.

## Reproduction

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_CHROME_MODEL_VERSION=default \
  LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-model-smoke conformance
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_CHROME_MODEL_VERSION=default \
  LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-media-smoke conformance
```

Model acquisition was separately approved and used LOCAL_LLM_DOWNLOAD=1 only
for the initial raw acquisition. All later suites used 0. Local targets remain
opt-in and forbidden in CI. No dependency or SDK runtime change was needed.

Raw reports, model manifest, errors, metadata, render and lifecycle evidence are
retained in task artifacts `local-model-evidence/nano-2026-10-25`.
The separate Gemma E4B Chromium report remains unposted at the user's request;
no new issue or comment was submitted for Nano.
