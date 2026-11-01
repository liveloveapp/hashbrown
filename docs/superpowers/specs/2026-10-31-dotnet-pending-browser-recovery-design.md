# Explicit settlement of pending browser calls after cold recovery

Status: next-milestone specification, 2026-10-31. All additions below are **unreleased**. This document authorizes no SDK release and makes no implementation, integration-test, or live-provider passing claim. npm 0.8.3 and NuGet 0.1.0-preview.1 retain their published contracts. Never republish those versions or describe this feature as available in them.

## Goal and selected design

An application can reload a conversation with unresolved browser calls, supply results it already knows or explicitly acknowledge unavailable results, and continue once. A mixed batch also submits every genuine protected-native approval decision in the same operation. Restoration is inert. Original browser handlers never execute as a consequence of restoration or settlement, including approval, remount, configuration updates, retries, host restart or replica handoff.

Select one explicit settlement command with a local epoch token, a negotiated V2 recovery snapshot, journal-enforced server revision CAS, and narrowly witnessed public typed call/result normalization before native FICC. Reuse existing durable canonical history and browser/protected binding evidence. Do not invent browser approvals or infer authority from transcript text.

Out of scope: automatic browser execution/retry, general chat persistence, arbitrary retained upstream history, private upstream APIs/reflection, opaque session JSON editing, new dependencies, cloud managed identity, changes to release safeguards, or automatic release. Newly issued model calls after an admitted continuation retain normal application tool policy. An unavailable original browser result never proves that its external effect did not happen.

Alternatives considered: keep every pending browser batch blocked (safe fallback, no useful settlement); rerun browser tools (cannot establish absence of original effect); separately settle results and approve native work (creates partial authority/state); synthesize browser approval responses (probe loses browser call); use opaque upstream history surgery or normalize after FICC (unsupported and bypasses native execution). None is selected.

## Evidence and source inventory

Read alongside `AGENTS.md` and these repository extension points:

- `packages/core/src/models/conversation-recovery.ts`, `models/interrupt.ts`, `chat-runtime.ts`, recovery/interrupt tests, `reducers/index.ts`, `effects/generate-message.effects.ts`, and `transport/hashbrown-run-agent-input.ts`: restore provenance, local revision, interrupt ownership, execution gates, canonical transport.
- `packages/react/src/hooks/` and `packages/angular/src/resources/`: chat, structured, completion, UI and with-message public facades.
- `packages/dotnet/src/NativeSessionRecoveryEndpointConfiguration.cs`, `NativeSessionContracts.cs`, `NativeSessionRawRequest.cs`, `NativeSessionContext.cs`, `NativeSessionEndpointConfiguration.cs`, `NativeSessionHistory.cs`, `NativeApprovalAdmission.cs`, `NativeApprovalAgent.cs`, `NativeSessionAgentFactory.cs`, `NativeSessionProjection.cs`, and `PostgresNativeSession*.cs`: negotiation, binding, acquisition, projection, effect/publication fences and persistence.
- `tools/conformance`, runtime smoke hosts, .NET tests/public API/package consumer checks, and existing recovery docs: implementation qualification and published legacy baseline.

Design inputs: `/private/tmp/hashbrown-dotnet-next/recovery-design-draft.md` and `recovery-design-review.md`. Research: `recovery-probe/HANDOFF.md`, `Program.cs`, `validate.py`, `final-wire.json`, `validation.json`, `packages.lock.json`, `assembly-identities.json`, `proof-sha256.json`, `build-qualified.log` and preserved negative strategies in that same private directory.

The pinned public-MAF probe records 1,152 research cases across three strategies. Its 384 paired-block cases (192 mixed, 192 browser-only; redundant browser-only decision labels) pass independent actual serialized OpenAI Chat Completions **and** Responses wire validators, exact browser result/native effect checks, prior history/text preservation, canonical-public immutability and public session roundtrips. It uses the production application-owned-history empty filters, a fresh deserialized agent, public AGUI conversion/stream adapters, and an injected no-network HTTP handler. Deterministic HTTP 400/ClientResultException stops capture. This proves characterized request serialization, not live provider acceptance, ASP.NET routes/auth/journal, full production integration, arbitrary retained native history, multi-call batches or final projection. Failed strategies remain negative evidence, not passing coverage.

Official provider contract cross-check: OpenAI's [function-calling guide](https://developers.openai.com/api/docs/guides/function-calling) permits string results including JSON/error representations and associates each output with its original call. Its [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) identifies distinct call/output items correlated by `call_id`. These sources support the preserved identifier and explicit unavailable-result representation; they do not qualify the application's journal, arbitrary native history, new APIs or exactly-once external effects. The pinned SDK wire probes remain the version-specific implementation evidence.

## Public TypeScript contract

Add public TSDoc types in core, export through established barrels, and reuse these public types in frameworks. Internal cross-package helpers alone use the `ɵ` prefix.

```ts
interface PendingBrowserRecovery {
  readonly protocolVersion: 1;
  readonly serverRevision: number;
  readonly callIds: readonly string[];
}
// Add optional pendingBrowserRecovery?: PendingBrowserRecovery to ConversationSnapshot.
interface PendingConversationRecovery {
  readonly id: string; // fresh local restoration epoch; never a server token
  readonly serverRevision: number;
  readonly toolCalls: readonly Readonly<{
    id: string;
    name: string;
    arguments: Readonly<Record<string, JsonValue>>;
  }>[];
  readonly interrupts: readonly Interrupt[];
}
type BrowserRecoveryOutcome =
  | { readonly toolCallId: string; readonly status: 'result'; readonly value: JsonValue }
  | { readonly toolCallId: string; readonly status: 'unavailable' };
interface ResumeConversationRecoveryOptions {
  readonly batchId: string;
  readonly outcomes: readonly BrowserRecoveryOutcome[];
  readonly entries?: readonly ResumeEntry[];
}
// ChatRuntime:
readonly pendingConversationRecovery:
  StateSignal<PendingConversationRecovery | undefined>;
resumeConversationRecovery(options: ResumeConversationRecoveryOptions): void;
```

`JsonValue` means an exported existing public JSON type, or one minimal recursive public type if none exists. No framework public signature exposes internal types. React exposes the pending value; Angular exposes a Signal; both expose the exact command. Forward through every chat, structured-chat, completion, structured-completion, UI and with-message surface that exposes conversation restoration. Preserve existing signatures and semantics for native-only recovery/ordinary warm resume.

Restoration validates the existing original system-message identity/text, full canonical AGUI history, current tools/arguments, state and response-schema provenance before any state changes. Capability version must equal 1, server revision must be a positive safe integer, and distinct bounded call IDs must identify **every and only** durably declared unresolved browser call. Derive names/arguments from validated canonical messages; never trust duplicate descriptor fields. Exclude protected/server calls and already settled calls. A snapshot without the capability retains existing strict unresolved-browser rejection. Malformed/extra capability fields, partial IDs, changed configuration or unsupported version fail atomically. The existing local expectedRevision remains independent of serverRevision.

Pending state is cloned immutable data with no handlers, delegates, private native args, approval internals or owner tokens. Store it outside executable queues. Restore/render/remount/ordinary effects perform zero tool or transport calls. All runtime methods, reducers and effects enforce the gate; direct action dispatch cannot bypass it. Ordinary resume, generation, resend/message mutation and state mutation reject while pending. Tool/system/schema configuration changes cannot silently rebind the batch: reject the update or retire it through an explicit new-thread operation. A new thread clears claims and invalidates old local tokens.

Settlement synchronously validates local idle epoch/token, configuration identity, all browser outcomes exactly once and all genuine protected decisions exactly once, then claims once. Browser-only entries are absent/empty. Mixed entries are complete existing ResumeEntry decisions; no browser call uses a ResumeEntry. No partial mutation, native preparation, callback or transport occurs on failure. Build an immutable checkpoint with the exact browser results plus complete decisions and captured serverRevision. Invoke continuation directly, bypassing original browser tool coordination. Duplicate/reentrant submission loses before transport.

## Canonical results and persistent uncertainty

Known strings become their exact AGUI tool-content string. Other JSON values use strict JSON serialization; null becomes `null`. Accept only null, finite numbers, booleans, strings, dense arrays and plain data objects (ordinary or null prototype, own enumerable string data properties). Reject cycles, sparse arrays, undefined/functions/symbols/BigInt, nonfinite numbers, accessors, custom prototypes and hidden/symbol properties; do not invoke getters or silently drop data. Clone without mutating inputs. Limit depth to 64. The client checks the actual UTF-8 serialized complete request against its locally known request-byte cap (default 1 MiB) before HTTP dispatch. It need not know server configuration. Independently, the server enforces its configured PublicBytes/MaximumMessages/MaximumCalls/ArgumentBytes limits, including any smaller limits, before acquisition, native preparation or callbacks. A request within the client cap may therefore receive a bounded server rejection. Do not add dependencies.

Unavailable content is this exact compact reserved string, generated only after an explicit application outcome:

```json
{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}
```

It is an observation of missing evidence, never cancellation, successful execution, proof of no effect or permission to retry. Reserve this exact marker representation: even a known string equal to it receives the conservative uncertainty display. Document the reservation. Add a public `browser-result-unavailable` variant to ConversationRecoveryDiagnostic containing threadId, messageId, toolCallId and exact content; recover it deterministically from canonical matching tool messages on restore and after acceptance. Existing unstructured-history diagnostics remain unchanged. Render escaped ordinary text; UI wording is “Continue with result unavailable”. Preserve uncertainty after subsequent save/reload without relying on transient metadata. A marker-like string that is not exact remains ordinary known content. Server requires exact marker content for status unavailable.

Canonical incoming settlement is **the unchanged stored message array followed by exactly one tool-result message per pending browser call, in original announcement/call order**. IDs are fresh, nonempty, unique and do not collide with history; each result carries its exact toolCallId. No insertions into old messages, cancellation annotations, user turns, reordered announcements, protected result injection, changed system/state/config or extra results are admitted. Complete mixed decisions live only in the existing resume field. This append rule is shared by the core builder and server validator; provider adjacency is handled only on the independent native clone below. Existing warm cancellation annotation admission stays separate.

## Negotiation and exact wire

The existing recovery POST uses unchanged ConversationRecoveryConfiguration body plus a single `Hashbrown-Recovery-Version: 2` header. Absent header returns existing schemaVersion 1 behavior, including browser/mixed blocking. Duplicate/malformed header returns 400; unsupported numeric version or V2 without capable journal returns 406. Do not silently downgrade. A client requests V2 and requires schemaVersion 2 before using pending-browser capability; never synthesize it from V1.

V2 keeps NativeSessionRecovery's existing outer fields: schemaVersion, disposition, serverRevision, optional snapshot/reason. Browser-only and mixed ready recoverable rows use disposition `Pending` and a complete snapshot with `pendingBrowserRecovery: {protocolVersion:1,serverRevision:27,callIds:["browser-call-1"]}`; serverRevision must agree with the outer field. Mixed snapshots also contain the complete genuine protected interrupts. Native-only/completed snapshots retain existing semantics. Busy, expired, corrupt, unbound, unsupported and unknown-effect states receive no pending-browser capability. Reads remain authenticated, bounded, no-store, nonexecuting and nonmutating.

Only the explicit continuation adds this transient AGUI extension:

```json
{"hashbrown":{"recovery":{"version":1,"serverRevision":27,"outcomes":[{"toolCallId":"browser-call-1","status":"unavailable"}]}}}
```

This fragment is within forwardedProps; responseSchema/ui and existing approved extensions remain alongside it. For a known value use status `result`; actual values occur only in the canonical tool messages. Resume is absent/empty for browser-only and complete for mixed. Strict parser rejects unknown fields, duplicate JSON properties, aliases/case variants, invalid version/revision, duplicate/missing/foreign IDs, invalid statuses and over-limit data. All applicable existing raw-request validation remains enabled.

First validate strict raw syntax and `NativeSessionRawRequest.RequireEquivalentBinding` against the **original** bounded raw and bound RunAgentInput. Parse request-local recovery evidence from the original raw. Then construct independently sanitized public canonical, typed input and transport clones, removing only the validated recovery extension. Keep raw evidence immutable and available for strict admission. Empty/unknown/malformed recovery data must reject rather than be discarded. Actual NativeSessionContext input, approval transport clone, HashbrownRequestClient/provider options and saved public/opaque representations must not retain the extension. Raw diagnostic observations may intentionally record it under existing policy. Never persist it as configuration or forward it to the model. Tests inspect actual objects/provider wire and subsequent generations, not only normalized JSON.

## Journal capability, authority and acquisition

Introduce an optional public interface, preserving compiled custom-journal compatibility:

```cs
public interface INativeSessionBrowserRecoveryJournal : INativeSessionJournal
{
  ValueTask<NativeSessionAdmission> TryAcquireBrowserRecoveryAsync(
    NativeSessionKey key, string originalRawRequestJson,
    NativeBrowserRecoveryRequest recovery,
    CancellationToken cancellationToken = default);
}
```

`originalRawRequestJson` is the immutable ORIGINAL bounded full request body, including complete resume decisions and forwardedProps.hashbrown.recovery; it is never a sanitized or reserialized canonical request. Every capable journal, including custom implementations, independently validates strict raw syntax and the typed recovery envelope against this original body, validates full admission evidence, and constructs its own sanitized canonical representation. `NativeBrowserRecoveryRequest` is an immutable documented typed envelope (ProtocolVersion, ServerRevision, Outcomes); each outcome contains ToolCallId and Status only. Typed input is not substitute authority. The interface contract requires complete transaction CAS/admission before ownership/native preparation. Postgres explicitly implements it. Add an init-only `BrowserRecoveryCallIds` property to NativeSessionStatus populated only from validated durable evidence. Preserve all existing positional record constructors and Deconstruct signatures, including ConversationSnapshot and recovery DTOs; new properties use additive bodies. Do not alter INativeSessionJournal signatures or infer support from status fields alone.

Both MapRecovery V2 advertisement and the execution endpoint require this typed capability. Any recovery envelope with an incapable journal rejects before acquisition, session deserialize, native preparation or callbacks. Execution always routes it to TryAcquireBrowserRecoveryAsync, never ordinary TryAcquireAsync. The envelope is required only to access the new cold-recovery/extended admission rules; omission cannot invoke those rules. Existing ordinary warm browser-result and native-approval admission paths remain backward compatible and continue through their established validation without requiring this envelope. The new revision-CAS guarantee applies to explicit cold recovery, not legacy warm requests. Custom implementers explicitly opt in only when implementing the full documented contract.

Inside the existing Postgres transaction, bind the full authenticated owner/agent/isolation/partition/thread key; validate supported snapshot version, retention/expiry and Ready saved state; require row.Revision == captured serverRevision. Validate canonical original configuration/history and exact appended result delta. Validate all durably witnessed browser IDs and argument/name/public-position bindings; for mixed, establish exact relationship between ExpectedBrowserCallIds and BrowserBindings and validate all genuine protected requests/decisions. Neither list alone is interchangeable authority. Reject corrupted, foreign or unsupported evidence before callbacks. Reserve ownership and the complete decision batch consistently under the same lease/effect fences before deserializing/executing native work. If existing reservation remains a second transaction, recheck current ownership, full admitted batch and revision lineage; never expose partially admitted decisions or run preparation before both gates succeed.

One concurrent CAS winner may admit; stale-but-identical history still conflicts. Return 409 for revision/state conflict, 400 for malformed shape/prefix, existing scoped indistinguishability for unauthorized keys, and existing bounded transient errors where appropriate. Losing requests leave public/native state unchanged. Recovery acquisition retries must carry the original expected revision; no Publishing/Ready race loop may reread and substitute a newer revision. Expiry cleanup that advances revision cannot then admit stale input.

Default expectation is **no PostgreSQL DDL**: existing canonical history, ExpectedBrowserCallIds, BrowserBindings, native approval evidence and atomic saved session/public request are sufficient. Validate legacy persisted rows and version handling. If production proof reveals missing durable authority, stop that implementation path and specify an additive migration explicitly; do not fabricate bindings from untrusted history or relax the protected-count invariant to manufacture browser-only approval batches.

## Public native continuation bridge

At NativeApprovalAgent.Restore after journal acquisition/evidence/full decision reservation and immediately before InnerAgent.RunStreamingAsync/FICC, build a pure independent native input clone from exact admitted evidence. Apply only to the current witnessed recovered batch; leave all previous history untouched.

Browser calls remain ordinary declaration-only FunctionCallContent followed by the exact supplied FunctionResultContent. Reconstruct only genuine protected ToolApprovalRequestContent from owned durable bindings and pair with its genuine CreateResponse decision. Produce complete call/settlement pairs in original call order before a later assistant/user message. Preserve prior roles/content/completed call/results, current text and unrelated text. Grouped current calls may split into typed clone messages with stable collision-free clone IDs; do not mutate canonical public message IDs, call locations or stored history. Native TextContent interleaving that canonical AGUI cannot represent has no reconstruction guarantee. Unknown current AIContent/annotations/metadata must fail closed unless explicitly preserved and tested.

Retain the production clone policy that removes browser declarations before ToChatRequestContext and restores them as declaration-only tools in native ChatOptions; the original public tools/config remain intact. Otherwise the public converter can manufacture an extra approval response. Do not reconstruct nonconfirmation browser ToolApprovalRequestContent or add browser CreateResponse(true): retained probes demonstrate failure/lost call. Do not normalize inner-provider histories, sweep historical calls into new pairs, change opaque session bytes or rely on FICC internals.

NativeSessionProjection must bind normalized echoes and generated protected results back to the original public locations, suppress only exact witnessed informational echoes, and save exactly one canonical result per call with original history intact. Projection correctness, multiple calls, missing native message IDs and metadata preservation are production obligations, not established by the research probe. Native approved decisions execute one effect; declined/cancelled execute zero; completed/Started effects never redispatch.

## Local failure and retry ownership

| Event | Required state |
| --- | --- |
| Synchronous local validation failure before dispatch | Identical pending batch/token, no calls or mutations. |
| Proven pre-dispatch transport failure | Same batch may remain usable; no automatic retry. |
| Definitive structured rejection proving no acquisition/effect | Preserve batch only if its revision remains valid; otherwise require authoritative refresh. A 409 always requires refresh. |
| Acknowledgement, timeout, disconnect, cancellation, malformed stream, ambiguous admission/failure | Retire local submission claim into recovery-required, block every resubmission/generation and require authoritative recovery read. |
| Acknowledged successful continuation | Adopt accepted canonical state; retain durable uncertainty diagnostics; clear pending epoch. |

Unknown network errors are ambiguous even before an acknowledgement reaches the browser. Do not automatically restore a generic retryable resume checkpoint. “Once” means one admitted continuation per server revision/ownership, not a claim of one transport attempt in every network failure path. A fresh recovery lookup uses the current local revision and issues a fresh local token; it may return Busy/UnknownEffect/Completed/new pending state. A crash after protected Started remains UnknownEffect under existing fences, with zero redispatch. Fresh-thread escape remains explicit.

## Compatibility and release boundary

Keep V1 client snapshots/browser blocking and existing ordinary warm browser-result/native-approval admission unchanged; do not require recovery metadata for those legacy paths or imply a new CAS guarantee for them. Verify the current published preview1 server rejects new recovery metadata by exact configuration/admission mismatch before any callback. New source must explicitly reject unknown recovery metadata rather than allow a tolerant strip-and-execute path. If the actual legacy binary accepts it, rolling deployment of V2 is blocked until traffic can be pinned to explicitly V2-capable endpoints; never assume CAS from an advertised revision. New clients reject schema/version downgrade and cannot send recovered continuations to unqualified servers.

Implementation CI uses identifiable source-built/local candidate artifacts for all new public APIs, with package/API snapshots and independent consumer checks. Retain a separate current published npm 0.8.3/NuGet preview1 legacy baseline and its existing first-milestone live qualification. New examples/docs label candidate functionality unreleased; future publication requires separately authorized new versions. No release, registry upload or same-version replacement follows from this milestone.

## Acceptance and implementation sequence

Each implementation slice starts with meaningful failing tests, demonstrates the expected failure, implements the minimum and reruns to green. TypeScript tests use top-level test(...) and arrange/act/assert blank lines. Public APIs require TSDoc/XML docs; no new dependency. Preserve existing projection, retention, authentication and unknown-effect behavior throughout.

1. **Server authority first:** RED V2 with incapable/custom journal, stale revision, exact browser-only/mixed result delta, full decisions, callback-before-CAS trap and metadata sanitation. GREEN optional interface, strict parser/clone boundary, typed capability gating and transactional acquisition. Include duplicate JSON properties/headers, unsupported versions, malformed/oversize/depth data, changed key/system/schema/tools/state, edited history, reordered calls, protected-result forgery, missing/foreign/duplicate results or decisions, corrupt evidence and expired Saved cleanup.
2. **Native bridge and projection:** RED production public fake-IChatClient route/session fixtures against both actual Chat Completions and Responses serialized wire, then GREEN witnessed pre-FICC pairing and exact public projection. Cover browser-only/mixed, approved/declined/cancelled, known string/null/object/unavailable, several browsers and several protected calls, ordering/grouped/split/text/history permutations, echoes, annotations, missing message-ID fallback and two public serialize/deserialize cycles. Assert one exact result per ID, zero browser invocations, native effect counts, stable public IDs/positions and no transient envelope in actual executable/persisted representations.
3. **Core and all facades:** RED inert restore and atomic settlement on public contracts, then GREEN gate/epoch/checkpoint/wire/diagnostic propagation. Assert zero handlers/transports on render/remount/options/state/ordinary-resume/reducer bypass, stale token, repeated and reentrant submit, configuration mismatch, strict JSON edge cases and bound sizes. Check exact outgoing AGUI and completion/structured/UI/with-message public type forwarding in React and Angular.
4. **Durability and races:** real Postgres restart and replica tests; two tabs/hosts race with one CAS winner; stale equivalent transcript; crash before/after reservation, Started, save and publication; disconnect/timeout/ambiguous stream requiring reread; safe definite rejection; expiry, retention, legacy rows/custom journal compatibility and unchanged native-only warm flow. Distinct acquisition/preparation/effect/provider/read counters establish fences. No model key is needed for deterministic acceptance.
5. **Both browser frameworks and packaging:** conformance reload of browser-only/mixed state, explicit known/unavailable settlement, complete approval/decline/cancel, second-tab race, host restart, uncertainty after acceptance and another reload, V1/malformed/downgrade blocking and explicit fresh thread. Inspect public consumer APIs and exact HTTP wire. Keep candidate tests separate from published legacy qualification.
6. **Required final verification:** build/test/lint every affected Nx package using `npx nx <target> <project>` (including core, React, Angular, conformance/runtime hosts and www when changed); run relevant API reports, .NET documented-public-API/package/consumer checks and Postgres tests. Use actual configured project targets, report unavailable targets and all failures/warnings, and inspect final diff. No live test can substitute for these invariants. PR/merge follows the root task's authorized green-check workflow; SDK publication remains separately gated.

No unresolved product decision blocks implementation. Production qualification may reveal unsupported native metadata or inadequate legacy-server rejection; those are explicit fail-closed acceptance gates requiring a narrowed supported case or deployment contract, never a workaround that weakens authority. The characterized public bridge establishes a viable starting path, not completion of those gates.
