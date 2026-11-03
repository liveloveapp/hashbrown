# Native provider-input projection research

This research refines the unreleased pending-browser recovery design. It is not
live vendor acceptance, production feature qualification or a published-package
claim. Public npm 0.8.3 and NuGet preview1 remain separate immutable artifacts.

## Observed production failures

The actual factory/authenticated route/PostgreSQL/public-session test matrix
exposed two failures despite deterministic model fixtures returning HTTP 200:

- Several protected calls can become separate assistant-call messages before
  their outputs, violating Chat Completions grammar. Original browser/protected
  interleaving can also change.
- A second ordinary fresh-agent continuation can reproduce later assistant text
  before existing canonical tool results. Fixing only the initial recovered
  request leaves this later request invalid.

Strict validators inspect actual serialized requests and catch these failures;
successful fixture streams alone do not establish valid provider input.

## Public input-layout experiments

The isolated private probe used copied frozen references with no repository
ProjectReference, new dependencies, private upstream API invocation, credentials
or real model requests. Pinned dependencies were MAF 1.26.0, MEAI 10.10.0,
MEAI abstractions/OpenAI bridge 10.10.1 and OpenAI 2.14.0.

The homogeneous manifest executed 240 cases: ten public input layouts, three
original call orders, plain/rich text, approved/declined decisions and both real
SDK serializers. The heterogeneous manifest executed 48 further cases using
opposite approved/declined assignments. Each used two browser and two protected
calls, genuine public approval requests/responses, actual native invocation and
public session serialization/deserialization. Deterministic HTTP 200 SSE
responses allowed native completion while independent validators assessed the
captured wire.

All 288 native runs completed with the expected approved effect IDs and unchanged
original public source. All strict grammar/order/text constraints passed in only
116/240 homogeneous and 16/48 heterogeneous cases. No tested layout preserved
general interleaving across the full manifest. Sharing protected message IDs
repairs grouping, but still moves calls and cannot close the second-cycle
history failure. These counts describe experiments, not supported feature cases.

The pinned implementation reconstructs approval calls at one last approval
anchor and places rejections before approvals. This explains the observed
limitation; it is an inference for the pinned version, not a guarantee about
future releases. [Pinned Microsoft source](https://raw.githubusercontent.com/dotnet/extensions/02107c65bab30aad9e35b5133ed643eaa77bccd8/src/Libraries/Microsoft.Extensions.AI/ChatCompletion/FunctionInvokingChatClient.cs).

Public invocation middleware and outward streaming observations confirmed that
the actual invocation return/completion and genuine native results are available
before provider entry. Production still needs independent actual-return and
durable completion/rejection witnesses; an outward/model value alone is not
result authority.

## Result-codec characterization

A separate 34-case probe exercised seventeen return forms through both actual
serializers. It found these meaningful distinctions:

| Actual invocation value                           | Canonical AG-UI content                                | Default SDK provider formatting |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------- |
| Default-factory JsonElement string                | Quoted raw JSON string                                 | Serialized JSON string          |
| Raw CLR string                                    | Plain string                                           | Same plain string               |
| JsonElement object/array                          | Exact raw JSON                                         | Reindented JSON                 |
| JsonElement null                                  | The string `null`                                      | The string `null`               |
| Null reference from void/Task void/custom marshal | Native success sentinel `Success: Function completed.` | Same sentinel                   |

Ten additional private cases used deliberately non-default JSON layouts through
both serializers. They correct an overly general inference from already-indented
default-factory returns: preserving a JsonElement's raw witness does not preserve
provider wire formatting. Its raw value remains unchanged through invocation,
outward native observation and provider entry; the SDK then serializes it with
its indented options. String results pass through. This is corroborated by both
the [pinned Chat conversion](https://raw.githubusercontent.com/dotnet/extensions/59e1741f6fb45cf7ae08e2df088aef71537a7bc4/src/Libraries/Microsoft.Extensions.AI.OpenAI/OpenAIChatClient.cs)
and [Responses conversion](https://raw.githubusercontent.com/dotnet/extensions/59e1741f6fb45cf7ae08e2df088aef71537a7bc4/src/Libraries/Microsoft.Extensions.AI.OpenAI/OpenAIResponsesChatClient.cs),
and by the actual production-route first/second-cycle mismatch. These isolated
experiments do not independently qualify Azure hosting or a live service.

AIContent, AIContent collections and custom-marshaled objects remain references.
A getter-trap object had zero getter reads at invocation middleware and outward
result observation, then one during provider serialization. The recovery witness
codec must reject unsupported references without serializing them or invoking
getters. Typed JSON and explicitly characterized immutable primitives can be
owned without changing application values. Raw JSON must not be minified into
a different actual-return witness. After authenticating that typed witness, the
reviewed current-batch projection emits the exact canonical AG-UI content string
at provider INPUT, avoiding further SDK reformatting across ordinary cycles.
Application returns, FICC input and public/native output remain unchanged.
The public raw accessor materializes its value
before its exact byte count is known; the design bounds retained witnesses and
does not claim an unavailable preallocation guarantee.

## Reviewed direction and evidence boundary

Use separate authority modes: fully completed accepted canonical history may be
projected into ordinary provider-compatible pairs without historical approvals;
the current recovered batch requires genuine native execution/settlement and
independent actual-return witnesses before provider-input projection. Canonical
IDs/history/state/config and opaque session bytes remain unchanged. This is an
explicit refinement of the earlier blanket projection prohibition, documented
in the [reviewed design](../specs/2026-11-01-dotnet-provider-input-projections.md).

The original 405 frozen probe files, twenty copied reference DLLs and eight loaded
dependency identities remained unchanged. Both final research builds had zero
warnings/errors. Probe implementation and raw evidence are task-local research
artifacts; production route, package and browser acceptance remain required.
