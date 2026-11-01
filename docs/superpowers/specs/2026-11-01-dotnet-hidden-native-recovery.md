# Held ordinary native calls during browser recovery

Status: independently reviewed and implemented Task 3 refinement, unreleased; server-bridge qualification is recorded in [the checkpoint](../research/2026-11-01-dotnet-pending-browser-bridge-qualification.md). This extends only B in [provider-input projections](2026-11-01-dotnet-provider-input-projections.md). It adds no public API, protocol, dependency, durable schema or release.

## Observed production gap

A genuine initial provider batch can contain browser calls, protected server calls and ordinary server calls. The pinned native agent deliberately holds ordinary server descriptors privately while waiting for browser results. Their absence from the initial public transcript is supported by the journal's `mayHideCaptured` validation. They are not completed history for A.

Actual authenticated factory/PostgreSQL/public-session cases across both providers and APIs show an initially Captured hidden call with zero effects. Recovery genuinely completes the protected and hidden calls, then B refuses their mixed native call container before the provider. The original B manifest contains only public browser/protected members and cannot explain the hidden call. Keep this RED and the effect fences; do not misclassify it as an unsuccessful initial producer or a supported recovery.

The [pinned MAF pipeline](https://raw.githubusercontent.com/microsoft/agent-framework/9c8a3514a15a702f81bfda456d80c7ccaa4d2712/dotnet/src/Microsoft.Agents.AI/ChatClient/ChatClientExtensions.cs) has two distinct held-call paths. With a genuine protected batch, [ApprovalNotRequiredFunctionBypassingChatClient](https://raw.githubusercontent.com/microsoft/agent-framework/9c8a3514a15a702f81bfda456d80c7ccaa4d2712/dotnet/src/Microsoft.Agents.AI/ChatClient/ApprovalNotRequiredFunctionBypassingChatClient.cs) stores ordinary non-confirmation approval requests. Its [PrepareApprovalMessages helper](https://raw.githubusercontent.com/microsoft/agent-framework/9c8a3514a15a702f81bfda456d80c7ccaa4d2712/dotnet/src/Microsoft.Agents.AI/ChatClient/ToolApprovalHelpers.cs) extracts protected responses and inserts protected plus automatic held responses immediately AFTER THE LAST UNFINISHED PROTECTED REQUEST, before trailing browser pairs/text. Without a protected batch, [InvocableFunctionBypassingChatClient](https://raw.githubusercontent.com/microsoft/agent-framework/9c8a3514a15a702f81bfda456d80c7ccaa4d2712/dotnet/src/Microsoft.Agents.AI/ChatClient/InvocableFunctionBypassingChatClient.cs) stores ordinary calls and appends their responses at the END. Hashbrown must not read/modify private storage or construct these responses. [Pinned FICC](https://raw.githubusercontent.com/dotnet/extensions/02107c65bab30aad9e35b5133ed643eaa77bccd8/src/Libraries/Microsoft.Extensions.AI/ChatCompletion/FunctionInvokingChatClient.cs) reconstructs rejected protected, approved protected and held calls at the resulting last approval anchor. Grouping is stateful: a requestless held call reuses the current group until a grouping dictionary exists; after that it resolves the empty key or a fresh fallback group. Plain GroupBy is not equivalent.

The earlier universal END inference considered only the invocable decorator and was wrong for mixed protected batches. Actual protected-first and rich-native layouts exposed that error. This correction selects a single preimage-derived path; it does not permit choosing whichever provider-input position happens to arrive.

## Selected design and alternatives

Support a bounded fixed held-call set H, with independent native outward ordering observations and separate actual-return witnesses. Membership, execution authority, ordering and result truth remain distinct. B stays a pure provider-input transformation; native dispatch and genuine protected approval remain unchanged.

A singleton-only bound would avoid ambiguity but unnecessarily reject ordinary multiple-call policy. Provider-only set matching, ID sorting, native invocation-completion order and opaque-state reconstruction are rejected alternatives. Saved pending descriptors are sorted by ID and cannot establish original hidden model order.

H's specified order is its newly visible genuine native outward call order. There was no previous public H order. Preserve every original public call's order and every original public message/ID/content/configuration exactly. Do not claim to recover original private model ordering. If native observations cannot establish the required order/shape before the provider, refuse the shape rather than filling evidence from provider input.

## Fixed admission manifest

Freeze H before InnerAgent.Run, together with the existing current B manifest:

- Derive H only from the authenticated acquired snapshot's PendingCalls, excluding every call ID already present anywhere in saved/admitted canonical public history and every public current browser/protected member. Existing explicitly public unresolved ordinary calls remain a separate existing path.
- Each descriptor has immutable bounded ID/name/version/arguments, current catalog identity, session key, claim token/generation/revision and admission/manifest binding. Require a registered invocable native server function with current RequiresConfirmation=false and exact catalog version. Use pure metadata checks, without application validation callbacks or getters/converters.
- Require unique, bounded, disjoint membership and existing ID collision rules. A later observer cannot add a member or promote a fresh call. Reject an unexplained saved pending descriptor before execution rather than granting it approval or reconstructing private native state.
- H receives no browser outcome, ResumeEntry, protected RequestId or synthetic Hashbrown approval. Its invocation remains authorized only by the existing native catalog, independently captured descriptor and owned journal Start/Complete fences.

## Independent outward observations

At NativeApprovalAgent's owned native streaming boundary, before public filtering, observe the genuine reconstructed server call groups needed to corroborate H. Require the same active session/claim and exact fixed descriptor identity/name/arguments. Include associated current protected members so mixed groups are explained as a whole. Record native update/content ordinals, group identity and immutable bounded call tuples; immediately clone supported data. Duplicate/foreign members, unknown metadata, unsupported fragmentation and mutable aliases are refused.

This observer supplies H's outward order and placement corroboration, never membership, approval or actual-return truth. Native adapters can enrich outward AgentResponseUpdate author/time metadata. Do not assume those enriched headers equal provider ChatMessage headers: provider header expectations still derive from the immutable prepared preimage and pinned FICC transformation. Check the supported relation explicitly; do not copy enriched metadata into old messages.

Seal a read-only observation only when all H call observations and independently authenticated results are complete. First and subsequent provider entries require this sealed observation. Missing/partial evidence cannot be supplied by provider input, dictionary enumeration, completion scheduling, or saved descriptor order. Genuine fresh model IDs remain outside this fixed observation.

## Separate held-result lifecycle

Use an H-specific immutable result witness, separate from protected witnesses and their exact protected-key equality. Bind H descriptor/manifest identity, call tuple, session key, owner token/generation/revision, and the getter-free actual-return snapshot. Never invent a protected request/batch identifier for H.

The existing native invocation middleware must stage H's supported actual return before CompleteDispatch, publish it only after successful same-claim durable completion, and compare its genuine outward FunctionResult once against that independently captured value. Completion by itself, a native/provider result, HTTP success and outward ordering observations do not authenticate a value. Require complete exact H result coverage before provider entry; reject duplicate, missing, changed, wrong-tag, old-owner/generation or unobserved results.

Reuse the characterized codec: exact raw/type JsonElement, immutable CLR strings and native null-reference sentinel. Unsupported application objects/AIContent/collections/getters/converters are refused without reflective serialization. Only independent provider result clones receive the authenticated canonical STRING. Actual returns, native FICC lists, public events and opaque native state remain untouched.

Share aggregate accounting across protected and held staged/completed records and outward observations. Enforce configured total count, UTF-8 retained bytes, argument bounds and depth. Moving between states must not charge twice; separate maps must not each receive a fresh full cap. Observation snapshots must not create an unbounded second argument/header copy.

## Exact provider transformation

Once outward evidence is sealed, a pure planner predicts the pinned native transformation from the immutable public preimage and fixed H tuples/order:

1. Protected decision encounter order is partitioned rejected then approved; H follows approved protected calls in sealed outward order. Simulate FICC's actual grouping state machine, first-header retention, dictionary transition, empty-key behavior and constrained fresh fallback identities.
2. Select the native path BEFORE reading provider input. A nonempty genuine current protected set selects the automatic-approval helper: anchor the reconstructed protected/H block at the immutable prepared preimage's LAST UNFINISHED PROTECTED REQUEST. Count ordinary residual messages and browser call/result events before that request; normalized request/response messages are adjacent, so the existing captured protected anchor applies. A browser-only current batch selects the invocable path and its END residual/event anchor. Require matching fixed native producer/evidence conditions; ambiguous origins remain unsupported. Never accept either anchor opportunistically. Browser pairs and unrelated text retain their exact positions around the selected anchor, with complete residual/header comparison.
3. Match every current protected/H call and result exactly once, complete group member order, group boundaries, headers, current informational markers, rejection/approved result partitions and independent result witnesses. No arbitrary mixed contents, wrappers, regrouping, moved text or unexplained sibling becomes legal.
4. Produce existing public current call/result pairs at their captured original template positions, in original public call order. Append independent H ordinary call/result pairs AFTER the entire reconstructed template/residual, before genuinely fresh suffix work, in sealed outward H order. This closes all original public calls before later unrelated text and places H where it first becomes publicly visible.
5. Use deterministic collision-free provider clone IDs, preserve H call IDs and authenticated exact string values, and revalidate on every provider entry. Fresh work retains ordinary policy and cannot collide with original/current/H IDs.

There is no old public H location to restore. Its actual newly emitted TOOL_CALL_START parent can be a native continuation clone ID. Preserve that genuine new public announcement and result under existing canonical folding; never reinterpret it as an original public location, append H into an old public message, or replace an existing public message ID. Later ordinary A cycles treat completed canonical H as ordinary accepted history, with no held-call authority surviving the request.

## Failure boundaries

All existing raw/bound equivalence, sanitation, catalog, lease, fixed-membership and admission limits remain ahead of execution. Reading a pending capability remains read-only and nonexecuting. No automatic replay is introduced.

After execution starts, unsupported native shape, absent observations, invalid/oversize return, completion refusal, cancellation or lease loss withholds provider/public success and preserves Started/Completed/consumed Blocked/UnknownEffect fences. Never infer that an ordinary function is read-only from its name. Neither H nor protected/browser original IDs may dispatch again; newly issued IDs continue to follow normal application policy.

## Test-first acceptance

- Retain actual singleton RED, then qualify real initial effect0/Captured/no-public-H followed by exactly-once genuine native execution and supported recovery for both providers/APIs. Include browser-only plus H and mixed protected/browser plus H.
- Qualify multiple H (at least two and three) with native order deliberately opposite sorted IDs and varied completion delays. Prove newly visible public/provider H order equals the independently observed native order, without claiming private original model order.
- Cover one/three protected requests, approved/declined/cancelled mixtures, grouped/split/different/null headers, stateful empty-key transitions, browser/protected original permutations and rich trailing text. Require the exact selected request-anchor or end-anchor/group prediction, and reject the alternative location.
- Prove all required call/result observations are complete BEFORE first provider projection. Missing/late observation cannot fall back to provider data; later mutation cannot change the captured expectation.
- Exercise strict real Chat/Responses serializers, exact values/order/cardinalities, unchanged admitted prefix/config/state, genuine public H announcements/results, repeated provider entries/fresh work and two subsequent fresh-agent ordinary cycles. Original browser/protected/H handlers never replay.
- Reject foreign/duplicate/missing H membership, public IDs misclassified as H, catalog/version/confirmation/argument drift, altered IDs/names/args/markers/metadata, swapped H order after sealing, wrong groups/headers/fallback/end-anchor, mixed text, forged/missing/duplicate results, wrong owner/generation/claim and fresh-ID collisions. Rejections reach zero provider calls.
- Exercise H actual-return tags/raw JSON/Unicode/null/void, unsupported getters/AIContent, combined protected+H count/byte/depth bounds, mutation after snapshot, durable-completion refusal/cancellation and stable accounting across repeated entries. Inspect durable effect states and no-retry cleanup.
- Run original bridge/warm/codec/store/publication/retention regressions and affected build/test/lint/API/old/new ABI/package gates. Require independent specification and quality review before Task 3 closes. No current source or research artifact constitutes this qualification.
