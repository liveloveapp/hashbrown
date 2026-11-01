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
