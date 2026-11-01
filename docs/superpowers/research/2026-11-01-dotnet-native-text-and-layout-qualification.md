# Native text transitions and provider layout qualification

This is a local, source-bound qualification of the pinned .NET producer path. It does not publish an SDK or qualify the complete cold browser matrix. The source base is `18676175`, with the reviewed uncommitted native projection change identified below. Existing package/runtime pins and the 73-type public API baseline are unchanged.

## Characterized failure and correction

The first eight actual Aimock/.NET producer probes used OpenAI and Azure with Chat Completions and Responses, each with two browser calls and two genuine protected native calls. Four tool-only cases passed. Four cases interleaving text and calls emitted every call but failed public projection before durable terminal publication. The failed streams and worker diagnostics were retained.

The pinned host attaches the next function update as the raw diagnostic on the preceding `TEXT_MESSAGE_END`. All six observed transitions had an immediately following real `TOOL_CALL_START` with the same diagnostic and the ending text's parent identity. The original diagnostic whitelist correctly rejected that previously uncharacterized boundary.

The correction retains one bounded, owned transition obligation for an already open assistant text. The immediate next event must be a real tool start with the same parent and deeply equal raw diagnostic, and must pass the existing strict semantic validator exactly once. Ordinary canonical call validation remains in force. Missing, changed, forged, unsupported or unresolved transitions fail closed. Retained-byte accounting and discard/completion cleanup include the obligation. No synthetic tool event, new authority, public API, dependency, or producer rewrite is introduced.

Two captured-shape positives and 47 negative mutations were exercised through the production projection in two top-level tests. Before the correction the positive test failed while the negative test passed; both passed afterward. The unchanged eight actual provider probes then all passed. Independent specification and quality reviews approved the correction.

## Observed canonical layouts

Four additional prefix-text probes emitted one real text block followed by all four calls. They required one saved canonical parent, the exact text, one corresponding real text-start event, and all four actual tool-start parents matching it. All twelve producer cases passed in the broader six-suite, 17-test native regression run. These are producer observations, not browser recovery or historical-settlement counts.

| API, for both providers | Tool-only parents | Interleaved-text parents | One-prefix-text parents |
| --- | ---: | ---: | ---: |
| Chat Completions | 1 | 1 | 1 |
| Responses | 4 | 2 | 1 |

Each case independently checked actual Ready/V2 recovery, original call locations, genuine pending approval and browser membership, arguments and zero durable effects. The installed pinned Chat builder and native path supply one completion identity for the current pending batch. No existing genuine route was found to create two current unresolved Chat parents; already settled history cannot substitute for current split membership. This is a bounded applicability statement about the characterized producer, not a universal limitation of Chat APIs or the SDK's generic canonical projection. Existing generic split-history source tests remain required.

Independent specification and quality review approved removing only these four inapplicable keys from the browser inventory:

- `angular.azure.chat.chat.multiple.split.history`
- `angular.openai.chat.chat.multiple.split.history`
- `react.azure.chat.chat.multiple.split.history`
- `react.openai.chat.chat.multiple.split.history`

All eight grouped-history cases remain, using the actual prefix-text producer for Responses. All four Responses split-history cases and every other obligation remain. The resulting legal inventory has 372 keys rather than 376, with no added keys. A dedicated before/after key-set regression must enforce this exact difference. These numbers describe the legal inventory only; passing browser results must be reported separately after execution.

## Reproduction and source identity

Actual root commands included:

```sh
npx nx test-runtime dotnet-conformance --testPathPatterns=candidate-native-text-transition --skipNxCache
npx nx test-runtime dotnet-conformance --testPathPatterns=candidate-split-producer --skipNxCache
npx nx test-runtime dotnet-conformance --testPathPatterns='candidate-split-producer|native-session-projection|native-approval-adapter|native-approval-decisions|native-approval-publication|native-completed-history-projection' --skipNxCache
npx nx api-check dotnet-sdk --skipNxCache
```

The first command supplies the focused RED/GREEN characterization; the producer selector was run first with eight and then twelve declared cases. The combined selector passed six suites and 17 top-level tests. The package API contract check passed without baseline edits. The complete package/browser/ABI gates remain separate requirements.

| Source | SHA-256 |
| --- | --- |
| `packages/dotnet/src/NativeSessionProjection.cs` | `da3d3d61b92deecde24b18e3795042abdc486f1c842ba62d3449e895214182f4` |
| `tools/conformance/dotnet/tests/candidate-native-text-transition.spec.ts` | `9f582b73153565a9e6e5839206bcb805ae18bd73efdb26d39d69a5b7fd5c7c41` |
| `tools/conformance/dotnet/tests/fixtures/candidate-native-text-transition.cs.txt` | `ea083e932c25a19b30ae439a6da3adc870efb9c0f5c9f3e76e550d82b9a6cc1a` |
| `tools/conformance/dotnet/tests/candidate-split-producer.spec.ts` | `f4d235ec0770cbb184022499860c69f760c92fc1ef67f51f8148d8ca3e0600fd` |
