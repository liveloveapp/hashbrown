# Extraction contract

`public-api.json` was captured from the original conformance assembly before the
Integration sources moved. The SDK-only reflection tool selects exported types in
`Hashbrown.Conformance.Integration` and normalizes that namespace to
`Hashbrown.AspNetCore`. It includes synthesized record API, generic constraints,
parameter names/defaults, ref/out, required/optional custom modifiers (including
init-only setters), enum values and nullable annotations.

The initial pre-move capture is preserved in the extraction evidence. The reviewed
custom-modifier format expansion was captured again from that same immutable
original assembly; removing only the added modifier text reproduces the initial
metadata exactly.

`documented-members.json` records the generated XML member identifiers for the
existing authored documentation plus the seven newly documented enum values.
Package verification requires each identifier. Compiler error CS1591 additionally
requires documentation for every authored public declaration. Compiler-generated
record members remain in the public API baseline but need no invented XML entries.

Changes to these baselines require explicit API review. Do not regenerate them to
silence an API mismatch.

The unreleased browser recovery protocol adds four public types and two nullable
init-only properties to the reviewed original contract. The metadata review
preserves all original constructors, Deconstruct methods and journal signatures.
Its 18 authored XML identifiers extend the documented baseline from 394 to 412;
internal helper documentation is excluded. An unchanged consumer compiled against
the published preview and a separate candidate reference/runtime consumer exercise
compatibility before baseline acceptance. Package tests additionally execute the
consumer against the runtime extracted from the locally packed candidate. These
additions do not describe the published `0.1.0-preview.1` package.

The PostgreSQL journal opts into the optional recovery interface through an
explicit implementation. This reviewed assignability change adds no concrete
public member and retains all existing signatures and documentation identifiers.

The unreleased crash-maintenance refinement changes the documented behavior of
`INativeSessionJournal.MaintainAsync` without changing its signature or XML member
identifier. PostgreSQL maintenance uses one bounded budget for privacy purges and
expired request-authority reconciliation. Its result counts distinct sessions
actually changed. Applications schedule maintenance for each compatible journal
registration; custom journals do not acquire this behavior merely by implementing
the interface. The original published API and compiled-consumer evidence remain
the compatibility baseline.

The committed [durability and compatibility checkpoint](../../../docs/superpowers/research/2026-11-01-dotnet-browser-durability-qualification.md)
records that unchanged published-version consumer against the exact final
acceptance archive DLL: 14 Deconstruct calls, four snapshot/save constructors and
the original 21-method custom journal. All 52 frozen original files remained
unchanged. This supplements the reviewed metadata/XML contract; it does not make
the new APIs available in published preview1. Candidate packaging and browser
acceptance require separate qualification of their final source and artifact
identities.


## Human C# reference

The upcoming, unreleased 0.1.0-preview.2 reference is committed in
reference-docs.json. It is generated from the built SDK's XML documentation and
the reviewed public API. It is separate from both compatibility baselines above;
generation refuses a compiled API that differs from the reviewed baseline.
Compiler-generated record members without authored XML are omitted from human
member lists and remain present in the ABI snapshot. SDK interface/base XML is
resolved for inherited documentation where available; external inheritance is
identified explicitly instead of inventing prose.

From the repository root, build the SDK with npx nx build dotnet-sdk, then run:

~~~sh
dotnet packages/dotnet/tools/bin/Release/net10.0/ApiSnapshot.dll --reference packages/dotnet/bin/Release/net10.0/Hashbrown.AspNetCore.dll Hashbrown.AspNetCore packages/dotnet/bin/Release/net10.0/Hashbrown.AspNetCore.xml packages/dotnet/api/public-api.json packages/dotnet/api/reference-docs.json
~~~

Replace --reference with --reference-check to verify freshness without writing.
The SDK's api-check and package test pipeline require this check. Output excludes
build paths, timestamps and informational-version commit suffixes. XML IDs retain
overload identity, and member anchors derive from those exact IDs.

The website reads committed input directly, outside the TypeScript collector's
reset directory, and requires no .NET SDK. C# pages live at
/api/dotnet/<type>; navigation, API index, search, sitemap and llms output link to
generated type routes and authored member anchors. A reference entry describes
upcoming source; it does not claim the package has been published.
