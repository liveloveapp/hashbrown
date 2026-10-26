# .NET Responses API parity

## Goal and approved scope

Qualify OpenAI and Azure OpenAI Responses through the existing Microsoft Agent Framework/AG-UI integration. Preserve Chat Completions compatibility and recommend Responses in both framework recipes only after parity passes. The user approved this direction and instructed continued work; Entra/live-account qualification remains the subsequent workstream. No SDK publication, NuGet distribution, release safeguards, or broad hosted-tool feature expansion is included.

## Alternatives

1. **Additive native-client integration (selected):** a trusted server API selector chooses Responses or Chat Completions while both use the existing IChatClient/MAF/AG-UI pipeline. Run the complete browser matrix for each API. This retains compatibility and measures actual parity.
2. Replace Chat Completions outright: smaller matrix, but removes a supported path and obscures migration regressions.
3. Translate Responses to Chat Completions in Hashbrown: superficially reduces changes but loses native request evidence and duplicates upstream responsibilities. Rejected.

## Architecture and configuration

`ProviderFactory` accepts `ModelApi=responses|chat-completions`. Omission preserves the previous Chat Completions behavior for copied source consumers; invalid values fail closed before model work. Both guides explicitly select Responses for new integrations. Provider, endpoint, deployment/model and API selection are trusted server configuration and cannot be chosen through AG-UI forwarded properties.

Use pinned OpenAI 2.14.0 ResponsesClient and Microsoft.Extensions.AI.OpenAI 10.10.1 AsIChatClient(model) for both providers. Azure Responses uses its documented OpenAI-compatible `/openai/v1/` endpoint; Azure Chat Completions retains the existing AzureOpenAIClient deployment route. Avoid upgrading dependencies unless a demonstrated incompatibility requires it. Validate API-specific endpoint handling and auth from captured requests, rather than assuming the previous Azure path/header applies.

Use request-local cloned options to explicitly disable Responses storage and provider continuation. Full canonical conversation input remains application-owned. Assert `store=false` and absence of provider conversation/previous-response authority on initial, tool-follow-up and recovered requests. Do not serialize a provider response ID into durable recovery as substitute history. Any adapter default that drops earlier history is an integration failure to fix or a blocker to report.

Structured schemas must reach native Responses `text.format` unchanged, with strict mode, and remain absent from unrelated subsequent requests. Native function-call IDs and function-call outputs must remain paired; AG-UI tools and confirmation ownership keep their current trust boundaries. Do not implement custom AG-UI SSE. Existing same-turn mixed browser/server tool restriction remains explicit; native MAF approval is separate work.

## Conformance harness

Add a test-only API dimension at the harness boundary so browser tests can retain their existing scenarios. Keep four original projects and add four Responses projects, totaling at least 344 cases (43 per framework/provider/API). Propagate selection into every memory and durable fixture worker, including restarts. HTTP suites retain original baseline and gain focused native Responses request/response tests.

Inspect original model HTTP payloads before aimock normalization. API-specific assertions must read the genuine shape (`input`, `text.format`, top-level function tools/call_id for Responses; messages/response_format/tool_calls for Chat Completions). Shared expected semantics may use small explicit test-only readers; never normalize away dropped inputs, IDs, reasoning, errors or tool history. Streaming gates recognize native Responses text delta events as well as Chat Completions deltas, counting actual forwarded characters. Preserve existing deadlines, zero retries, assertions and deterministic effect barriers.

Native Responses terminal failures/incomplete output, cancellation propagation, strict schema behavior and tool output IDs require positive and negative tests. Unsupported reasoning, encrypted continuation or hosted-tool items must not be silently discarded to claim recoverable terminal history. Determine their actual upstream serialization and prove the existing fail-closed outcome (`CompletedAnswerUnavailable` or rejected restoration) where exact canonical recovery cannot be represented. This project does not advertise full reasoning/hosted-tool recovery. The capture observer sees outgoing AG-UI SSE after native adaptation: it cannot detect items the upstream adapter has already dropped. Inject real native reasoning/encrypted/hosted items and prove capture is unavailable even when outgoing AG-UI looks text-only. Detect loss before native adaptation where necessary, or report a qualification blocker. New adapter diagnostics may be accepted only when proven strictly redundant with canonical content; never broaden an allowlist indiscriminately.

## Recovery invariants

Retain pure idle restoration, revision guards, authenticated scope/configuration matching, explicit approval/resume, at-most-one registered effect dispatch, unknown-effect reconciliation and independent retention. Tests must exercise reload/server restart, pre/post-effect crashes and completed terminal capture through Responses. Persist a server-owned compatibility identity at checkpoint creation and check it on both recovery reads and direct resume claims. Bind API, provider, endpoint identity and model/deployment; exclude secrets and never source identity from browser forwarded properties. Legacy rows must preserve their original legacy Chat Completions compatibility or fail closed when identity cannot be established; do not relabel old rows as Responses. A bounded schema migration may be needed. Test cross-API changes in both directions with unchanged browser input, both stores and restart, requiring no model requests or effect dispatch on mismatch. Also prove historical browser and server function_call plus matching function_call_output items occur exactly once with original call_id, arguments and output after recovery and on a subsequent user turn, alongside retained user/system/assistant history.

## Documentation and validation

Update both .NET guides identically for C# blocks, endpoint/model/API examples, explicit compatibility selection, stateless storage behavior and qualified limits. Compile all memory/PostgreSQL × confirmation × recovery recipe combinations and add API-specific build checks as needed. Record true case counts and warn that aimock qualification is not live-account validation.

Run affected .NET build/test/lint, conformance and both host checks, docs build/test/lint/routes and all original plus new browser cases. Independently review spec, plan and implementation. Create a PR, merge only on green required checks under the user's standing instruction, and verify merged/main/deployed docs. Do not publish another SDK release without a new request.

## Sources checked 2026-10-26

- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/model-providers/azure-openai
- https://github.com/Azure-Samples/azure-openai-to-responses-csharp
- Installed XML API documentation for the pinned OpenAI and Microsoft.Extensions.AI.OpenAI packages.
