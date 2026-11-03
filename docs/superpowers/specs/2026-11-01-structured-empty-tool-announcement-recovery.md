# Structured recovery of empty tool announcements

Status: approved design correction, 2026-11-01; implementation and qualification pending. This is an **unreleased, API-neutral contract correction**. It authorizes neither package publication nor a claim of successful execution. Published versions retain their existing contracts.

This correction belongs to [Pending Browser Cold Recovery Implementation Plan — Task 4](../plans/2026-10-31-dotnet-pending-browser-recovery.md#task-4--core-inert-pending-state-strict-checkpoint-and-uncertainty) and [Task 7](../plans/2026-10-31-dotnet-pending-browser-recovery.md#task-7--separate-candidate-consumers-and-actual-browser-cases). It refines answer-content validation within the [pending browser recovery design](2026-10-31-dotnet-pending-browser-recovery-design.md), while preserving its canonical-history, capability, decision and execution boundaries. The [candidate acceptance contract](2026-11-01-dotnet-browser-candidate-acceptance.md) continues to require all legal cases through the actual public facades.

## Observed failure and scope

The retained twelfth actual browser run passed 40 primary-chat cases, then failed its first `structured-chat.sibling.known-object` case during cold restoration. This is a partial failed run: **40 of 372 cases passed**, one failed and 331 were not run. It is not full browser acceptance.

The actual saved native session was Ready at revision 6. Its canonical public assistant message contained exact `content: ''` and two function calls, one browser call and one protected native call. The source stream contained tool-call events and a genuine interrupt terminal, with no text-message events. The retained structured configuration required an object with an `answer` string. The warm facade already represented the tool announcement; the fresh structured facade rejected restoration with `Recovery assistant content does not match the response schema.` before adopting pending state. The later missing-pending-revision timeout was a consequence of that rejection.

This is an interoperability gap in core restoration, not permission to rewrite fixture snapshots, manufacture a schema-valid answer or relax the browser runner's assertions. The private evidence and independent review are retained in `task7-structured-pending-restore-diagnosis.md` and `task7-structured-empty-toolturn-spec-review.md` under the owned qualification evidence directory. The actual failed packet remains failure evidence.

## Required behavior

A structured response schema constrains assistant answer content. An assistant message with the exact empty string and a nonempty validated native tool-call array is a tool announcement with no answer text to validate. Existing restoration already accepts the equivalent announcement with omitted content; the exact empty representation must be eligible too.

Apply this distinction only to the answer-schema rejection inside `restoreConversation`:

- First retain all existing canonical ownership, native AG-UI structure, identity, uniqueness and correlation validation. An eligible announcement is an already validated assistant message with `content === ''` and a present, nonempty `toolCalls` array.
- Exempt only that empty content from the structured-answer validation failure. Continue validating the message's tool calls and the remainder of the snapshot. Do not skip the outer message loop, return early or treat the nonempty array itself as execution authority.
- Apply the same distinction to current Pending announcements and fully settled Completed historical announcements. Earlier tool announcements remain in completed canonical history after their real results and final answer arrive. Eligibility must not depend on a current pending capability or interrupt.
- Preserve the canonical empty content property/value and original message/call IDs, parent relationships, argument strings, order and metadata. Introduce no transformation of canonical bytes: do not omit the property, replace it with undefined/null or artificial schema-valid text, trim text, or rewrite public/native history. Existing ownership and transport serialization remain unchanged.
- Keep restore inert. It must not call a browser handler, native executor or transport, replay a historical call, grant a protected decision, or automatically settle a pending browser result. Explicit continuation still requires the current local token and every applicable existing authority check.

The correction applies through every structured and UI restoration facade in React and Angular, including structured chat, structured completion, UI chat and UI completion. Final structured answers and UI payloads must still satisfy their actual retained schemas; UI output must still render only trusted exposed components.

## Strict boundaries remain unchanged

Plain empty assistant content with absent tool calls or `toolCalls: []` retains the existing strict answer-schema check. Whitespace, newlines, zero-width characters and every other nonempty string also retain that check even when tool calls are present. Valid nonempty schema-conforming content with calls remains supported; invalid JSON or schema-invalid nonempty content remains rejected. Omitted content retains its current behavior. Do not use truthiness, trimming or a blanket exemption for messages containing calls.

All existing native-message and local-projection-field restrictions, configured-system provenance, trusted tool/schema/configuration identity, expectedRevision CAS, registered browser argument schemas and JSON-object checks remain in force. Malformed descriptors, empty/duplicate/conflicting IDs and invalid registered browser arguments must still fail. The client does not gain a private native catalog validator or a new generic server-tool argument parser; those authority boundaries remain unchanged.

Pending capability validation must still require the exact supported version, valid server revision and complete distinct unresolved browser membership, excluding answered and protected calls. Missing capability retains strict unresolved-browser rejection. Genuine protected interrupt membership, expiry, complete decisions and explicit browser outcomes remain mandatory. Restore and settlement failures must preserve atomic state/revision/token behavior.

Do not select or broaden `preserve-diagnostics`, change its tool-message exclusions, fabricate cancellation/diagnostic provenance, infer a capability from history or weaken replay guards. No new public API, type, export, dependency, response-schema dialect or server wire capability is required. No C# canonical producer change is included.

## Test-first acceptance

Implementation is pending. First add a failing regression through the real public `createChatRuntime.restoreConversation` path with the actual exact empty-content tool-announcement shape and configured structured schema. Then make the smallest correction at the content-validation boundary and independently review the final source and tests.

Positive coverage must establish:

1. Browser-only Pending and mixed browser/protected Pending announcements restore under strict policy with valid capability/interrupt evidence, exact canonical content/call membership, fresh local ownership and zero handler/transport work.
2. Completed history containing the same empty announcement, genuine call results and a valid structured final answer restores without a pending capability. Restoration and a later explicit ordinary turn never execute those completed original browser calls.
3. Explicit valid continuation preserves the original empty announcement in outgoing canonical AG-UI history, supplies the exact browser results and protected decisions, and receives a genuinely schema-valid final answer. The empty announcement must not acquire fabricated resolved answer content.

Independent negatives must retain plain empty/no-call and empty-array rejection, whitespace/nonempty invalid text with calls, malformed call shape/IDs/duplicates, registered argument JSON/schema/object failures, unsupported local fields, changed configuration/system provenance, stale local revision, malformed/foreign/duplicate/missing/answered capability membership and incomplete/foreign protected decisions. Check rejection at the applicable restore or settlement boundary, with no partial history/state/revision/token mutation or handler/transport work. Existing strict cancellation and diagnostic tests remain required.

Run core build, test, lint and API-report validation after the final change. Run affected React and Angular builds, tests where available, lint and API-report validation, plus the affected conformance checks and public facade tests. Use the repository's `npx nx <target> <project>` convention. Verify the public ABI remains unchanged and review actual report changes rather than updating baselines to hide a signature change. Record failures and warnings. Passing a predicate-only test or repairing the snapshot in the fixture does not satisfy this contract.

## Source-bound qualification sequence

Commit the SDK fix, its tests and this specification together before recipe qualification so the source closure is honest. That source change invalidates prior packed SDK qualification and dependent candidate provenance.

After that source commit, rerun the complete required **12-stage Pydantic qualification** under the established pipeline. Obtain the actual new execution/evidence identity, tag and pin from that run; regenerate the dependent artifacts and program inputs, and complete WWW qualification against the resulting source-bound evidence. Do not hardcode a future source/evidence hash or substitute a hash-only metadata update for execution.

Then qualify fresh packed candidates for both SDK and .NET artifacts against the actual final immutable source closure, run all 20 required candidate controls and ABI checks, and execute the fresh full legal **372-case** browser matrix. Verify the actual result/proof intersection through all required compositions and facades. Earlier partial passes, a planned manifest or a fresh hash without fresh execution cannot qualify this source change. Retain earlier failed runs as failures.

No implementation, affected check, twelve-stage rerun, regenerated candidate, full browser acceptance or publication success is claimed by this specification. Root retains final source adoption, qualification, integration and publication ownership; no package publication is authorized here.
