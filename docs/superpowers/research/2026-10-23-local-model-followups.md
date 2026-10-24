# Local model capability follow-ups

Status: implemented capabilities have passed package and native media checks;
remaining live workflow, final release and verification scopes are separated below.
This report follows the [capability design](../specs/2026-10-23-browser-local-capabilities-design.md)
and [implementation plan](../plans/2026-10-23-local-model-capabilities.md).
Cross-hardware work (item 4 of the requested follow-up) is excluded by the user.
No Windows/Linux or NVIDIA/AMD results are inferred from this machine.

## Scope and implementation

| Area                     | Implemented behavior                                                                                                            | Evidence boundary                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Chrome image input       | Explicit `media.images` policy and application resolver; user AG-UI image parts become native decoded image parts               | Real framework image cases passed in Angular and React                                      |
| Chrome audio input       | Separate `media.audio` opt-in for bounded encoded PCM16 RIFF WAV                                                                | Raw native speech inference and real Angular/React transport cases passed                   |
| Native typed tools       | Continue returning unsupported; no speculative tool adapter                                                                     | Installed Chrome lacks required typed constructors and ignores the tools declaration member |
| Local provider workflows | Framework fixtures and loopback routes for tool handlers, dependency, application approval/denial, replay and follow-up history | Deterministic and actual-model runs are separate; final verification pending                |
| Responses protocol       | Consume raw SDK stream events and validate terminal output before forwarding completion                                         | 89 OpenAI tests passed; installed malformed output produced precise RUN_ERROR               |
| WebLLM                   | Application owns engine/model/worker/downloads/unload; adapter remains text-only                                                | No dependency or peer dependency added; no new vision/audio/tool support claimed            |

Canonical AG-UI multipart user content now survives run-input lowering and
immutable message-history snapshots. Valid content parts remain ordered and
structured; ordinary JSON arrays retain their legacy representation.

The Chrome adapter keeps the existing text-only default. Media requires an
application resolver `(part, { signal }) => ({ blob, dispose? })`. AG-UI inline
sources contain canonical base64 bytes, without a data URL prefix. URL sources
and opaque provider-issued file handles are resolved only under application
policy; the transport does not fetch them implicitly. It preserves content
order and rejects unsupported roles and media kinds before native execution.

Image policy accepts PNG/JPEG/WebP with defaults of 10 MiB encoded bytes and
16 million decoded pixels per image. Audio accepts PCM16 RIFF WAV with one or
two channels, at 8–48 kHz, without implicit resampling. Defaults are 10 MiB and
30 seconds per audio part, and 20 MiB total encoded media across a run's history.
`media.inputLanguages` defaults to `['en']`, independently of `outputLanguage`.

Media requests check exact requested modalities/languages, reject missing or
unknown availability, and require an explicit `events.downloadRequired`
callback before creation when a model is downloadable or downloading. Each
media run owns an isolated session. Owned decoded bitmaps and acquired resolver
disposers are released on completion, cancellation and failure; replay resolves
serializable media again. Media plus `transformRequest`, raw PCM, video,
documents and media tool results remain unsupported.

The [Chrome Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api)
documents image/audio input and text output, exact capability checks and
activation for model downloads. A browser version or accepted options object
alone does not establish a usable runtime/model combination.

## Observed raw native audio inference

The dedicated-profile probe in `/tmp/hashbrown-native-audio.json` ran from
2026-10-24 05:17:04.958 UTC to 05:18:51.486 UTC (October 23 locally). It used
installed Chrome **155.0.8059.85**, with the existing local launch settings that
restore normal Chrome feature defaults. No new browser, feature override,
dependency or model download was introduced.

The browser received exact `expectedInputs` of English text plus audio and
English text `expectedOutputs`; availability was `available`. An explicit click
created the session with active user activation, then submitted an encoded
`audio/wav` Blob and a transcription instruction. The fixture was generated
offline using the installed Samantha voice, converted with installed ffmpeg,
and retained with provenance in
[`speech.json`](../../../tools/conformance/local-models/fixtures/speech.json).

| Measurement            | Observed value                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| Fixture phrase         | The secret code is seven four two nine.                            |
| Returned text          | The secret code is 7429.                                           |
| Semantic assertion     | Passed, normalizing digits/number words and punctuation            |
| Session setup          | 35,788.5 ms                                                        |
| Generation             | 54,033 ms                                                          |
| Native operation total | 89,838.5 ms                                                        |
| Session destruction    | Confirmed before result publication                                |
| Browser context        | Closed after the experiment                                        |
| Fixture                | 79,116 bytes; mono PCM16; 16 kHz; 2.4699375 seconds                |
| SHA-256                | `76bf758918d5c0c871bd6f23ff820e1a85e201d686426284d83fc70c8554922f` |

This establishes one synthetic speech transcription through the **raw native
browser API**. This raw probe alone does not establish Hashbrown transport/framework success,
audio quality over a corpus, broad language support or microphone behavior.
No microphone, camera, personal files or personal profile was used. A sine wave
or an availability response would not substitute for this inference assertion.

## Native typed tool blocker

The same installed-browser probe observed:

- `LanguageModel`: function.
- `LanguageModelToolCall`, `LanguageModelToolSuccess`, `LanguageModelToolError`: undefined.
- A getter for `availability()`'s `tools` member was not read, although the call
  returned `available`.

Earlier retained probes also accepted tool-call/tool-response enum combinations.
That does not establish tool declaration recognition, typed output or result
replay. No real native tool call/result round trip has been demonstrated.

The [October 16 Prompt API draft](https://webmachinelearning.github.io/prompt-api/)
describes experimental declarative tools and typed call/success/error classes.
Tool-call output and replay input modalities are distinct declarations. The
draft does not establish that this installed browser exposes them. Hashbrown
therefore keeps native tools unsupported rather than parsing arbitrary model
text into executable calls.

After all feasible current-runtime tests finish, a user decision would be needed
before evaluating a newer browser, origin trial or changed runtime setup. Such
an experiment must still demonstrate a real typed round trip and result/error
replay; it must not count dictionary acceptance as support.

## Two separate Ollama Responses defects

Primary GitHub sources were verified read-only on this follow-up. No issue,
comment or other external message was sent.

### Empty terminal output serialization

The installed v0.35.0 path can produce terminal `output: null` when no output
items were accumulated. Its streaming `buildFinalOutput()` starts with a nil
slice. The pinned current main source starts with an empty non-nil slice, so
that streaming empty-output case serializes as `[]` instead. This source change
does not update the locally installed server or prove its live behavior changed.
See [v0.35.0 streaming source](https://github.com/ollama/ollama/blob/v0.35.0/openai/responses.go#L1919)
and [main at 675150d6ad2747df1e218ef59de9194bc4a7e538](https://github.com/ollama/ollama/blob/675150d6ad2747df1e218ef59de9194bc4a7e538/openai/responses.go#L2031).

Hashbrown now uses `responses.create({ ...request, stream: true })` rather than
an SDK accumulator and rejects terminal `response.completed` or
`response.incomplete` events whose `response.output` is not an array. Null,
missing or object output is a provider-protocol error, not successful empty
output. A valid empty array remains distinct from malformed output. This lets
Hashbrown report the actual protocol defect before accumulation obscures it;
it does not repair the upstream server's payload.

### Incorrect completion status after token truncation

Both inspected versions' streaming completion path still builds a completed
response and emits `response.completed`, without mapping `done_reason: length`
to an incomplete outcome. Fixing empty-array serialization alone does not
repair that status. See [v0.35.0 processCompletion](https://github.com/ollama/ollama/blob/v0.35.0/openai/responses.go#L1940)
and [pinned main processCompletion](https://github.com/ollama/ollama/blob/675150d6ad2747df1e218ef59de9194bc4a7e538/openai/responses.go#L2052).

[Ollama PR #17239](https://github.com/ollama/ollama/pull/17239) addresses token-limit
status propagation in streaming and non-streaming Responses, including
`response.incomplete`, incomplete details and message status. GitHub reported
it **OPEN** when checked; head was
`fd3ca4f398acd16d3cad2f3b68fab24b814482a9`. No release containing it is assumed.
This is separate tracking from the nil-slice serialization problem.

Do not infer truncation from token counts, rewrite null into `[]`, or treat
schema-valid JSON as proof of tool execution. The earlier installed
Ollama/Qwen schema-plus-tools probe produced a guessed token without executing
the required lookup; that remains a semantic limitation of the tested
model/runtime pair, separate from the two Responses protocol defects.

## Verified framework inference and integrated checks

`test-results/conformance/local-models/media/native-report.json` records four
expected passes, zero skips and zero unexpected outcomes in installed Chrome.
These cases use the actual Hashbrown transport and each framework's chat API,
rather than calling the browser API directly.

| Framework | Input           | Rendered answer          | Send-to-render/cleanup elapsed |
| --------- | --------------- | ------------------------ | ------------------------------ |
| Angular   | Generated image | Red                      | 25.23 s                        |
| Angular   | Retained speech | The secret code is 7429. | 56.28 s                        |
| React     | Generated image | Red                      | 55.13 s                        |
| React     | Retained speech | The secret code is 7429. | 56.98 s                        |

Every case recorded exactly one resolver acquisition, resolver disposal, native
session creation and native session destruction. These are whole framework
wall-clock measurements, not raw first-token timings or a quality benchmark.
They add actual transport/framework evidence to the raw browser canary above.

The coordinating verification run reports:

| Package | Passing tests          |
| ------- | ---------------------- |
| core    | 1,663 across 84 suites |
| angular | 272                    |
| react   | 204                    |
| openai  | 89                     |
| www     | 698                    |

Affected builds and lint checks passed, with existing warnings retained in the
logs; this is not a claim of warning-free output. Standard conformance discovery
collected 72 cases and excluded the local-only files; collection alone is not a
runtime pass. Independent review approved the transports, workflows and canonical
multipart lowering. Final release/merge and resulting CI remain unverified.

The installed-provider report records 10 expected outcomes, zero unexpected
outcomes and zero skips. Two schema-plus-tools cases are intentionally expected
semantic failures, not successful tool capabilities. The malformed completed
Responses payload was observed as `RUN_ERROR` with the precise message
`OpenAI Responses protocol error: response.completed response.output must be an array`.
This confirms adapter protocol reporting without claiming an upstream repair.

## Verification still to record

- **Pending:** the 20-case live framework workflow run, currently coordinated
  separately; preserve tool/permission/history evidence and actual model failures.
- **Pending:** the two retained raw audio Playwright cases, separate from the
  successful standalone raw probe and four framework media cases above.
- **Pending:** remaining final integrated checks, release commit/PR/merge and
  resulting source/CI verification. No merge or CI success is claimed here.

The local targets require `LOCAL_LLM_E2E=1` and reject CI. Media/audio live
canaries require an already available model and do not download it. Real GPU
suites run sequentially with a dedicated test profile. Replace pending entries
only after inspecting actual reports; shim success cannot fill a real-inference
result, and a raw browser result cannot fill a Hashbrown one.
