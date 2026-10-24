# Chrome native tools: v4 verification

Status: authorized v4 download completed; eight raw native compatibility canaries passed. The separate adapter has passed core tests and independent reviews; framework validation and release verification are tracked below.

## Environment and isolation

- Installed Chrome 155.0.8059.85, macOS; dedicated profile `/tmp/hashbrown-native-tools-model-profile`.
- Existing image/audio profile `/tmp/hashbrown-native-model-profile` remains separate.
- Feature bundle: `AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4`.
- Playwright preserves Chrome component/background networking and field-trial configuration. Generated loopback page receives an actual button click before create. No microphone, camera or personal profile data.
- Exact initial inputs: English text and typed tool responses; outputs: English text and typed tool calls. Tool declaration: `lookup_secret`, required object property `record` with enum `alpha`.
- Availability recognizes the tools getter and reports downloadable before creation. Typed call/success/error constructors are present under this flag bundle; installed constructors use `callID`.

## Initial verification gate

The standalone probe creates one owned session, requests a lookup of a random token never present in the prompt, validates one typed call, runs an application-owned lookup, returns a native typed success by ID/name and requires the exact token in the final text. Creation is bounded to 20 minutes and generation to 180 seconds per turn; finally destroys the session and closes the browser context and loopback server. Download progress is retained in `/tmp/hashbrown-native-tools-download.log`; final structured evidence in `/tmp/hashbrown-native-tools-roundtrip.json`.

Success, error and fresh-session history replay must all be measured before publishing an adapter. Unknown/unsupported behavior is not counted as a passing inference test.

## Primary sources

- [Installed Chromium flag mapping](https://github.com/chromium/chromium/blob/0e66b94549a8bd85f03fbdf189b752d6e7b63c32/chrome/browser/about_flags.cc#L4774).
- [Chrome tool-use demo source](https://github.com/GoogleChromeLabs/web-ai-demos/blob/main/prompt-api-tool-use/script.js): heterogeneous stream, application-owned execution, typed responses, bounded tool loop. Consulted October 24, 2026; mutable upstream evidence, not a pinned adapter contract.
- [Prompt API draft](https://webmachinelearning.github.io/prompt-api/).

## Download and first inference (October 24)

The authorized download and session creation completed in 591.446 seconds (about 9m51s). Local component manifest identifies `gemma4-2b-it`, base-model version `2026.06.10.0000`, component version `2026.8.7.929`; this is observed local metadata, not an inferred model name. Profile disk usage after acquisition was approximately 2.4 GiB.

The first real `promptStreaming` call returned exactly one structured tool-call chunk, no text:

```json
{
  "type": "tool-call",
  "value": {
    "callID": "",
    "name": "lookup_secret",
    "arguments": { "record": "alpha" }
  }
}
```

The probe rejected the empty identity before invoking its synthetic handler (`handlerCalls:0`) and destroyed the owned session. This establishes real typed call generation but **does not pass the tool round-trip shipping gate**.

The [October 16 Prompt API draft generation algorithm](https://webmachinelearning.github.io/prompt-api/#generate) requires an implementation-defined nonempty call ID. The installed Chromium bridge passes the native ID through unchanged: [executor callback](https://github.com/chromium/chromium/blob/0e66b94549a8bd85f03fbdf189b752d6e7b63c32/services/on_device_model/ml/on_device_model_executor.cc#L162), [browser forwarding](https://github.com/chromium/chromium/blob/0e66b94549a8bd85f03fbdf189b752d6e7b63c32/chrome/browser/ai/ai_language_model.cc#L417), [Blink conversion](https://github.com/chromium/chromium/blob/0e66b94549a8bd85f03fbdf189b752d6e7b63c32/third_party/blink/renderer/modules/ai/ai_utils.cc#L453). Source inspection therefore places the empty value upstream of the JavaScript adapter, but does not prove which proprietary native/model layer generated it.

## Reproduction and compatibility probe

Six strict raw canaries (success/error/history in both Angular and React browser projects) each reproduced `callID:""`, valid `lookup_secret` name and `{record:"alpha"}` arguments. All stopped before synthetic execution; every acquired session was destroyed exactly once. Constructor probes independently verified that `callID` initializers work while `callId`-only initializers throw a required-member error. This rules out a JavaScript field-alias mistake.

A separate diagnostic confirmed that a typed success with the original empty native ID returns the exact hidden token. This is diagnostic evidence, not a valid canonical AG-UI identity.

The explicitly labeled `LOCAL_LLM_TOOL_ID_NORMALIZATION=1` probe then assigned a UUID to the sole observed empty-ID call and consistently used it in typed results and reconstructed assistant history. All6 compatibility canaries passed:

| Project | Success | Error   | Fresh success history |
| ------- | ------- | ------- | --------------------- |
| Angular | 8.356s  | 15.034s | 17.312s               |
| React   | 12.922s | 17.734s | 16.360s               |

Durations are full Playwright test times, not isolated generation benchmarks. The test requires exact random token equality without trimming or postprocessing. This proves a single-call compatibility path; it does not establish that native IDs correlate. Initial adapter scope therefore permits ID synthesis only when the completed turn contains exactly one call. Empty-ID batches, mixed empty/valid IDs, conflicting aliases and duplicate nonempty IDs must fail before any executable event. A fresh owned session per run rehydrates canonical IDs from authoritative history and avoids a persistent native-ID translation table.

## Expanded replay verification

An expanded run first passed all4 Angular cases, including fresh error history,
then timed out in Chrome's availability query before the next React session
could be created. The remaining cases were interrupted to investigate rather
than treated as passes. That run's report was retained separately.

The next complete run passed all8 cases in both projects. It used the adapter's
exact authoritative-history strategy: create with system instructions only,
then pass the non-system history exactly once to `promptStreaming`, ending with
the typed tool response and without appending another user query.

| Project | Success | Error   | Fresh success history | Fresh error history |
| ------- | ------- | ------- | --------------------- | ------------------- |
| Angular | 13.097s | 10.597s | 7.753s                | 8.843s              |
| React   | 11.792s | 7.111s  | 10.821s               | 11.098s             |

These are full test durations. The interrupted availability timeout remains
runtime evidence; the subsequent green run does not erase it. A public adapter
must bound availability, creation, generation and caller-facing cancellation,
even if a native operation ignores its signal or never settles cleanup.

## Initial framework quality result

The first correct-profile framework run passed 6/8 cases. Lookup plus second-turn
history, Allow before side effects, and Deny plus error-history follow-up passed
in React and Angular. Both dependent cases executed exactly two handlers:
`follow_secret` received the exact random lookup token and produced a real
`HB_RECEIPT_<uuid>`. The model then returned that exact receipt inside a fenced
JSON object instead of the requested plain string. Raw native chunks and the
rendered UI agreed. Sessions balanced per case: lookup3/3, dependent3/3,
Allow2/2, Deny3/3; no page errors or fallback requests occurred.

The fixture's generic system instruction, “Return only actual tool results,”
was ambiguous when the actual result was an object. The native-only fixture
now explicitly instructs property extraction and plain-text token/receipt
output. This is application prompt policy, not transport rewriting. Exact raw
text and rendered assertions remain unchanged; no trimming, fence removal,
receipt normalization or expected-failure rule was introduced. The initial
report/traces were retained at `/tmp/hashbrown-native-framework-first-eight-evidence`
and `/tmp/hashbrown-native-framework-first-eight.log` before rerunning.

## Prepared upstream report (not posted)

**Suggested title:** Chrome 155 experimental v4 tool calls emit an empty `callID`.

**Environment:** Google Chrome 155.0.8059.85 on the existing M1 Max/32 GB test
machine; dedicated loopback test profile; no origin-trial token. Official
experimental feature bundle listed above. Downloaded component2026.8.7.929
identifies `gemma4-2b-it`, base version2026.06.10.0000.

**Reproduction:** In a secure/localhost page under the documented tool-use
feature bundle, prepare the v4 model using a trusted user click. Create a
session with English text/tool-response inputs, English text/tool-call outputs
and one `lookup_secret` declaration whose object schema requires
`record:{type:'string',enum:['alpha']}`. Ask the model to call that tool for
alpha through `promptStreaming`. Read native prototype fields explicitly
rather than relying on `JSON.stringify(instance)`.

**Actual:** All 6 strict raw cases produced one real typed call with
`callID:''`, `name:'lookup_secret'` and `arguments:{record:'alpha'}`. A separate
constructor probe with `callID:'synthetic-call'` preserved the supplied ID;
`callId`-only initialization failed with a required-`callID` error. This is not
an alias-read or JSON-prototype serialization mistake.

**Expected:** The [draft generation algorithm](https://webmachinelearning.github.io/prompt-api/#generate)
requires an implementation-defined nonempty call ID. Stable IDs are needed to
correlate results and persist canonical tool history. Empty IDs would be
ambiguous for batches; actual multi-call native identity correlation was not
established by these single-call probes.

**Diagnostic boundary:** Installed Chromium's native executor/browser/Blink
bridges pass `call_id` through unchanged (pinned source links above). This
places the empty value upstream of the JavaScript adapter but does not identify
the proprietary model/runtime cause. A sole-call application UUID workaround
passed exact success/error and fresh-history probes; it does not prove native
ID correlation and should not replace a browser-level fix.

The report is prepared for review only. No Chromium issue/comment or other
external message has been sent.

## Clarified application-prompt and cancellation quality result

The clarified native-only application prompt retained exact raw/rendered output
assertions and expanded to 10 cases by adding Stop followed by a fresh lookup.
That complete run passed 5/10 strict semantic goldens:

- Both dependent cases still returned the exact receipt inside a JSON object.
- Angular Allow wrapped the correct token instead of returning its bare value.
- After Stop, Angular executed the fresh lookup but returned counting text;
  React followed the prior counting task without selecting the new lookup.
- Both original Stop streams raised native AbortError and were destroyed
  **before** the next create. Fresh authoritative history contained the cancelled
  count USER message followed by the new lookup USER message; no interrupted
  assistant response was retained. The UI matched the new raw counting output.
- No page errors or HTTP fallback requests occurred. Stop session counts were
  Angular3/3 and React2/2 created/destroyed.

The full second report/traces were retained at
`/tmp/hashbrown-native-framework-clarified-prompt-evidence` and
`/tmp/hashbrown-native-framework-clarified-prompt.log`. This is neither a green
live quality suite nor evidence of native output-format guarantees. The adapter
must preserve canonical history and model text; it must not drop old requests,
rewrite replies, relabel errors as successes or hide these failures with xfail.
A final Stop-only run verified the source boundary in both frameworks before
asserting model quality: old-session AbortError/cancel/destroy preceded the
next create, no old-session chunks followed destruction or fresh creation,
active readers returned to zero, and both cases balanced two created/two
destroyed sessions. Both reports set `sourceBoundaryVerified:true`. The new
model sessions then continued counting and executed no lookup, so both semantic
goldens still failed. The authoritative input retained the cancelled user
request followed by the new user request, with no interrupted assistant reply.
Evidence is retained at `/tmp/hashbrown-native-framework-stop-boundary-evidence`
and `/tmp/hashbrown-native-framework-stop-boundary-verified.log`.

Any future cancelled-turn history policy or explicit schema-constrained final
phase needs its own design and conformance evidence.

## Joint schema and typed-tool capability probe

A separate raw probe used the installed v4 profile, exact tool declarations and
`promptStreaming` with a JSON `responseConstraint` requiring a single `token`
string. It required a real typed lookup before accepting the exact hidden token
in the final object. Chrome accepted the request but returned JSON text without
any typed call; the assertion failed (`Expected exactly one typed tool call`).
The session and context were closed. This is a failed composition canary, not
proof of joint support or a browser-level rejection. The shipped tools factory
continues to reject schema/UI composition explicitly. Evidence:
`/tmp/hashbrown-native-tools-schema-probe.json`.

After correcting raw error-history evidence serialization to preserve
`errorMessage` rather than invent a success result, the filtered error-history
canary passed in both Angular and React (2/2). This metadata correction does not
change the actual constructor, inference or canonical replay behavior.
