# Pending-browser durability and compatibility checkpoint

This qualifies the unreleased Task 6 source candidate. It does not publish SDKs or establish the new browser journeys reserved for Task 7. Published NuGet `0.1.0-preview.1` and npm `0.8.3` remain separate immutable compatibility inputs.

## Behavior

Application-scheduled PostgreSQL maintenance now reconciles expired request authority alongside privacy purges, using one bounded parent-row budget and the database clock after locks. Privacy expiry takes precedence and remains schema-wide; retained lease reconciliation requires the exact compatible registration and complete persisted key.

Safe Owned work returns Ready only after full dispatch/consumption fences and original plus prospective Ready validation against unchanged original epochs. Consumed approvals, declines and cancellations remain fences even before Started. Saved becomes Blocked; Publishing becomes PublicationUnknown. Transitions preserve retained payload and historical evidence, clear authority, and advance generation/revision once. Reads remain inert. A losing request cannot rebase: continuation requires a separate authoritative read and explicit submission at its new revision.

No native deserialization, model/tool callback, synthetic lease, DDL, dependency or public signature was added to maintenance. SQL, cancellation and operational failures propagate and roll back. `MaintainAsync` retains its existing XML identifier; its documented return value now counts distinct sessions actually changed. Custom journals do not acquire PostgreSQL reconciliation merely by implementing the base interface.

## Executed qualification

- **24 unique focused tests passed:** 20 durability tests and four exact published-server compatibility tests. Durability includes actual independent-process SIGKILL windows, complete decision consumption, Started/persisted effects, save/publication, competing owners, historical evidence and five genuine-row corruption cases. One test separately exercises public-journal PostgreSQL primitives, including bounds, full keys/partitions, cross-registration privacy, old-owner/receipt refusal, SQL rollback and in-flight cancellation; it is not a browser or SIGKILL test.
- Each of the four published-server cases sent four variants: **16 HTTP 400 rejections**, no model requests and unchanged durable rows/effects. The old server's V2 request returns schema 1 without a browser capability. A fresh portable installation reran the same four cases; these are not additional unique cases.
- **580 ordinary conformance tests passed in 63 suites:** 100 harness, 358 runtime and 122 package tests. Both affected conformance projects passed build, test and lint. The SDK passed build, API verification, eight package tests and lint.
- **Full package PR acceptance passed all nine phases:** one candidate pack, one primary npm preparation, 32 compiled recipe programs, original upgrade qualification, mandatory published compatibility, 64 existing browser smoke cases, six existing browser regressions and final NuGet/npm requalification. Those existing browser checks use the legacy public client contract and do not replace Task 7's new cold-recovery browser cases.
- The unchanged published-version consumer passed against both the standard candidate and the exact final acceptance archive DLL: 14 Deconstruct calls, four snapshot/save constructors and the original 21-method custom journal. All 52 frozen original files remained unchanged. Final acceptance archive SHA256: `8717ed74eac2bb3dbe237b3003ce45c8655b861352b0911c32afe0f678132924`; DLL SHA256: `57c8468d1cba66248fc6c7f01622989a3c6c68ef4e610d9ef77eb540ec31aa1e`.
- Independent specification and quality reviews approved the implementation and the final test correction without open P1/P2 findings.

The first safe-crash run failed on maintenance returning zero rather than restoring the expired owner. The final implementation passed the same real crash cases. Full regression testing also exposed an old test that equated canonical public grouping with the separately normalized native projection. Its replacement independently verifies exact public prefix/configuration and exact adjacent native pairs/results. Ordinary native results preserve canonical content strings; they are not compared directly with the original handler's typed return. No SDK behavior was changed for that test correction.

## Portable published baseline

The compatibility profile is explicit and uncached, fails without qualified inputs, and is mandatory inside the existing acceptance upgrade phase. Ordinary source tests retain their three profiles. The original upgrade checks, qualification evidence and release phase ledger remain intact.

Preparation verified all 13 steps from an exact detached producer checkout at `df1340f713d3b65165a494eb09e53246298df858`: original artifact integrity, official signed download, unchanged signature/payload/closure guards, isolated NuGet consumer, separate isolated npm consumer and post-qualification. Original unsigned/symbol inputs are retained as approximately 298 KB of immutable own-library test fixtures with fixed inventories and hashes. They contain no bundled dependencies. A random-path rebuild is not presented as reproducing the original DLL/PDB. The first npm preparation correctly rejected an ancestor directory; using a separate sibling directory fixed preparation without weakening isolation.

Published signed archive SHA256: `288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57`; published DLL SHA256: `37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2`. Fixture provenance is recorded in `tools/conformance/dotnet/published-baselines/0.1.0-preview.1/provenance.json`. Archive tampering, wrong/missing symbols, changed pins/producer, missing role inputs and wrapper failure propagation receive separate tests.

SDK and conformance builds reported no C# warnings/errors. Existing Nx/Jest, Node typeless-module and color-environment warnings remain. This checkpoint establishes no browser-handler nonexecution claim: persistent browser observations, packaged new client controls and the eight framework/provider/API compositions remain Task 7's acceptance boundary.
