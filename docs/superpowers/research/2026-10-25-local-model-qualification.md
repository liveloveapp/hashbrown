# Local model qualification follow-ups

Current status: PR #758 merged and verified. The approved default Nano download
subsequently passed 6/6 text/UI and 4/4 image/audio cases; native tool creation
failed before inference. See the [Nano qualification](2026-10-25-default-nano-qualification.md).
Availability tables below retain the earlier pre-download snapshot.

Snapshot: October 25, 2026 (local time). Main updated to `e73c10a8b` after
[PR #749](https://github.com/liveloveapp/hashbrown/pull/749) merged at
`7639ecd41a48ed3d73e26690475e5f477572fb31`. That PR ships application-controlled
Chrome tool phases. Its two fixed native samples each passed 8/10: all approved
single-component cases passed; nested UI remains a strict research canary.
See the [phase evidence](2026-10-25-chrome-tool-phases.md).

## Browser model identity and selection

Chrome **155.0.8059.85** in the dedicated test profile has an installed component
manifest identifying `gemma4-2b-it`, base `2026.06.10.0000`, component
`2026.8.7.929`. This is the model behind our tested **v4** configuration. The
`v4` browser experiment is not a parameter count or evidence of Gemini Nano 4B.

Pinned [Chrome 155 flag definitions](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/chrome/browser/about_flags.cc)
couple the native-tool flag to `AIPromptAPIToolUse`,
`OnDeviceModelConversationBackend`, and
`AIApiFoundationalModel:model_version/v4`. A separate `kGemma4Choices` entry uses
that same model-version setting. The [model resolver](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/chrome/browser/ai/ai_manager.cc)
looks up experimental use cases in the downloaded feature configuration and falls
back to the default when a key is missing. An accepted flag is not model identity.
The [create-options IDL](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/third_party/blink/renderer/modules/ai/language_model_create_options.idl)
has no application-level model name or parameter-count selector.

Installed broker manifest `1.20261018.2` contains separate default
`prompt_api` → Nano v3 solutions, `v4` → `prompt_api_gemma4`, and
`v4_4b` → `prompt_api_gemma4_4b` entries. The last route references
`gemma4_4b_component`, version `2026.7.28.1044`; it is not the Nano route.
Manifest SHA-256:
`e7906327ec210cd84ae69e10a926514361902a72dc2c34cc4c7a565534d51f0b`.
These are local manifest observations, not a stable public Chrome configuration API.

Availability-only probes, without session creation, inference or model downloads:

| Browser experiment                                      | Typed interfaces                     | Exact typed-tools availability                                             |
| ------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Browser default; no tool feature flags                  | Absent                               | Tools dictionary ignored; returned downloadable does not establish support |
| Default model with tool/conversation interfaces enabled | Present, tools dictionary recognized | downloadable                                                               |
| v4 with tool/conversation interfaces                    | Present, tools dictionary recognized | available                                                                  |
| v4_4b with tool/conversation interfaces                 | Present, tools dictionary recognized | downloadable                                                               |

The default Nano route can be selected by omitting the foundational-model
override. It has since been downloaded and identifies v3Nano; its manifest
still does not expose a parameter count. At the original pre-download snapshot, neither Nano nor Gemma E4B inference
had been tested. The linked later reports now establish bounded no-tool UI
qualification for both, and image/audio fixture results for Nano.
No tool quality, schema or nested-UI compatibility follows from availability.
Public [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api)
uses Gemini Nano naming and directs developers to on-device internals for model
inspection; it does not promise a `gemini-nano-4b` application option.

The local harness now accepts `LOCAL_LLM_CHROME_MODEL_VERSION=default|v4|v4_4b`
for native text/capability, media and tool/UI suites. Omission preserves existing
defaults; explicit `default` retains requested tool interfaces while omitting the
model override. Report metadata labels the request and whether it applies to
native execution. Download gates and CI refusal remain unchanged.

## Ollama 0.40.11 requalification

The installed client/server is **0.40.11**, matching the
[current release](https://github.com/ollama/ollama/releases/tag/v0.40.11).
Existing `qwen2.5:14b` (Q4_K_M, digest
`7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`)
was reused; no server update or model download was needed.

The unchanged, unfiltered provider suite passed **7/10**, with no retries/skips.
Both native and Responses schema-plus-tools cases returned no required lookup.
The Responses five-token tool case emitted no executable tool completion, but
reported terminal `stop` instead of the required `length`. It remains a failure.
The old empty `output:null` validation error was not reproduced in this run.

Pinned [v0.40.11 Responses source](https://github.com/ollama/ollama/blob/v0.40.11/openai/responses.go#L1910)
initializes terminal output as an empty array, fixing the previously audited nil
serialization. Its [completion path](https://github.com/ollama/ollama/blob/v0.40.11/openai/responses.go#L1986)
still hardcodes completed; [truncation PR #17239](https://github.com/ollama/ollama/pull/17239)
remains open. Schema/tool grammar [issue #18944](https://github.com/ollama/ollama/issues/18944)
and proposed [fix #18975](https://github.com/ollama/ollama/pull/18975) are open.
This distinguishes upstream grammar/protocol defects from receipt-copy quality.
The subsequent full framework rerun at the same 0.40.11/model combination
passed **12/20**, without retries, skips or expected-failure reclassification.
Four dependent cases still changed `HB_RECEIPT` to `HB_RECEPT`; four schema/tool/UI
cases executed zero required calls. This reproduces both earlier failure classes
in Angular and React. Reports and attachments are retained with the qualification
artifacts, and PR #754's validation record includes the result.

## WebLLM interoperability boundary

The existing worker qualification uses **0.2.85**; current official release is
[0.2.86](https://github.com/mlc-ai/web-llm/releases/tag/v0.2.86).
Hashbrown still takes an application-owned structural engine and adds no WebLLM
dependency. Published 0.8.2 supports text, schemas and trusted UI and rejects tools and media
before engine generation. PR #764 adds explicitly enabled, bounded user images
with an application-owned resolver and image-capable engine; see the
[real vision qualification](2026-10-25-webllm-vision-qualification.md). Tools
and audio remain unsupported by this adapter.

Both versions' native tool path rejects supplied system messages and
`response_format`, injects its own Hermes instructions/schema, and allows only
five Hermes model IDs. See the pinned
[0.2.86 protocol validation](https://github.com/mlc-ai/web-llm/blob/v0.2.86/src/openai_api_protocols/chat_completion.ts)
and [catalog](https://github.com/mlc-ai/web-llm/blob/v0.2.86/src/config.ts).
This conflicts with Hashbrown's system instructions and schema/UI contract.
The [streaming engine](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/engine.ts#L609)
emits raw call JSON before terminal parsed calls; call IDs are absent. Existing
[conversation serialization](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/conversation.ts#L451)
does not faithfully replay assistant tool-call records or correlate tool result
IDs. Merely passing `tools` through would lose required semantics.

WebLLM 0.2.86 adds audio input to its upstream protocol, guarded by pipeline
input capabilities. That does not add audio to Hashbrown or establish a compatible
loaded model. The image opt-in uses an application-provided runtime and compatible model;
it does not select, install or load a model for an application. Tool/schema/UI support needs an upstream change or a separately designed
protocol. No system instruction, output schema or history is silently discarded.

## Release check and remaining decisions

The earlier snapshot found core 0.8.1 and correctly recorded that it predates
#749. A subsequent fresh npm read and GitHub CLI check now agree on **0.8.2**,
`gitHead: a9436b48e6d46dc399b6c465c598661cf4ecf5b7`, published October 25
in the user's local timezone. Direct inspection of that registry tarball verifies
`toolPhase`, `ChromeToolsTurnContext` and `schemaFinalization` declarations.
The phase API is published. The new WebLLM image API is absent from 0.8.2 and
requires PR #764's source changes or a later release.

Registry tarball SHA-256:
`97063b6f3f0e3f79e6a72e921850b7ddce7c4ba499328b260b9b0f06ca2b4023`.
Integrity: `sha512-QDiXDH8gzSBYFF00MQQlflYVreYGOzzudE1Z2UkRnCFTvNr03xqj/okIoAxXOltBkhHSAHH5joMIiV9v5CD4eA==`.

The user has approved Gemma `v4_4b` first; its acquisition and fixed qualification
are tracked in the [4B report](2026-10-25-gemma4b-qualification.md).

Remaining: resolve the Gemma E4B native-tool creation gate before qualifying
its tool workflows;
minimize nested UI failures without weakening canaries; follow Chromium empty
call-ID issue [577500782](https://issues.chromium.org/issues/577500782) and batch
identity constraints; design WebLLM audio/alternative tool interop; verify a
future Ollama grammar/truncation fix and rerun receipt workflows. Cross-hardware
work remains explicitly deferred.

Durable raw evidence is stored in the task's `local-model-evidence/qualification-2026-10-25`
artifact folder: original availability probes, broker manifest, and the complete
Ollama report with retained attachments. Configuration/contract checks do not
substitute for native model inference.

## Harness verification

The helper's seven new tests failed before implementation and now pass; the
full conformance unit suite passes 52 tests. Conformance build/typechecks and
lint pass. All 30 unchanged phase contracts pass in React and Angular. Each
native configuration was separately checked to refuse CI; listing tests with
an explicit 4B request verified metadata without inference. Review identified
and reproduced a stale hardcoded v4 field in the capability attachment; it now
records actual launch arguments. Both framework 4B interface/availability checks
pass (2/2), with model creation and downloads forbidden; they establish no
inference capability. Independent review approved the corrected change. Existing Nx/Vite deprecation, module-loader,
color-environment and bundle-size warnings remain; no new lint warnings.
