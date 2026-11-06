# .NET release readiness for npm 0.9.0 and NuGet 0.1.0-preview.2

## Goal and authorization

Prepare the next coordinated Hashbrown release, improve .NET onboarding and API
documentation, and provide trustworthy release qualification. The user approved
brainstorming, specification, review, implementation through subagents, a PR, and
merge on green. Publication is explicitly reserved for a new session. Do not
publish packages, create release tags/releases, move channel tags, or dispatch a
publisher. A merge may deploy the documentation through the ordinary main flow.

The starting revision is `b8c43894080a121bbb6c7c3dafe956b4e820964d`.

## Approaches considered

1. **Coordinated readiness, selected.** Separate current candidate identities from
   immutable historical baselines, prepare the matching archives, and improve the
   runnable example and documentation. This retains meaningful upgrade controls.
2. Replace all historical version pins. Simpler initially, but invalidates the
   published baseline and can silently qualify new code as old public software.
3. Publish first and repair onboarding afterwards. Conflicts with the explicit
   publication hold and leaves the first-run experience unverified.

## Release identity and historical compatibility

- The ten projects already in `nx.json`'s npm release group become `0.9.0`, with
  matching internal dependency/peer pins and framework package-version constants.
  Keep the private root package version independent. Include the already merged
  breaking Magic Text to prose migration in upcoming release notes.
- The current NuGet package becomes `0.1.0-preview.2`. Keep .NET 10, SDK feature
  band policy `10.0.402` with latest patch, and existing third-party dependencies.
  This work adds no third-party dependency and makes no new runtime-support claim.
- Retained npm `0.8.3`, official NuGet preview.1 archives, producer revision,
  signatures/hashes, frozen consumer and historical live evidence stay immutable.
  Candidate verifiers must not accept historical metadata as current. Historical
  verification uses the explicitly pinned original producer/identity, never an
  expected identity inferred from untrusted metadata.
- Candidate npm preparation may replace only exact internal Hashbrown package
  version references in the retained dependency graph. Rewrite the corresponding
  generated lock entries, including dependency/peer metadata. External package
  versions, integrity and dependency relationships remain frozen and validated.
- Package helpers, recipe compilation, proof fixtures and publication validators
  must select the current candidate deliberately. A proof for preview.1 cannot
  authorize preview.2 publication.

## Qualification before and after publication

Local acceptance uses exact packed npm and NuGet archives, isolated consumers,
actual loaded assembly witnesses, existing signature/payload controls where
applicable, and fresh source/installed/archive provenance. It does not label a
local candidate as registry-published.

Preserve the existing 54-case live baseline profile unchanged. Add a separate
release recovery profile with the existing six framework/authentication
compositions and two groups: cold restore and result reconciliation. A provider-
free list command exposes the exact twelve identities. Reserve at most three
calls per case plus the existing three preflights (39 total); retain the existing
384 output-token ceiling, 60-second case and 900-second run bounds, serial
execution and zero retries. Validate selection/provenance before credential
loading or acquisition. Diagnostics contain allowlisted facts and identities,
not credentials, raw transcripts or privileged arguments.

The cold group must observe genuine pending native/browser work, persist it,
drain and stop the first worker, restore on another worker using the same durable
schema and qualified package bytes, settle the complete batch once, and verify
the original call/results in actual subsequent provider input. Require no original
browser-handler or server-effect replay. The reconciliation group suppresses
delivery only after genuine continuation commit, then adopts authoritative
Completed state; repeated reads produce no model work, effects or native run
events. Use a separate passive observer, not process-local warm-approval counters
as a substitute for cross-worker evidence. Missing usage, cleanup, provenance or
exact case membership fails qualification.

Candidate-live mode uses actual candidate qualifiers before and after drain.
Future public mode requires exact registry-installed `0.9.0`/preview.2 and real
official npm integrity and NuGet signature/payload receipts, with producer and
loaded-binary anchors. Reject mixed origins, ranges, latest, missing receipts and
source fallback. Do not invent future signed hashes. Because publication is held,
actual verification of those versions on public registries is a documented
post-publication action, not an acceptance claim for this PR.

Existing full source (664), candidate cold (372), isolation (20), cleanup fences
(40), package documentation compilation (32), old-server compatibility and ABI
checks remain required. New checks supplement their semantics and do not weaken
inventories, timeouts or retry policies.

## Runnable public .NET starter

Add `examples/dotnet-starter` with a real ASP.NET Core application and small React
and Angular clients, using the existing pinned dependency graph. The server uses
an exact SDK PackageReference, not copied Integration code, a ProjectReference or
an arbitrary DLL. Responses is the explicit startup default; OpenAI/Azure and
deployment/model selection are server configuration. Serve either built client
from the same origin. Demonstrate a browser tool, a read-only .NET function with
native approval, explicit interrupt controls, recovery diagnostics/settlement and
an explicit new conversation action.

Make initial setup runnable without importing internal `Testing` authentication:
an explicitly enabled Development-only local identity rejects nonloopback
connections and unsafe origins. Identity/scope are fixed by the server, not a
caller header or thread selector. Production requires the application's actual
authentication/authorization integration and fails clearly when absent. Do not
suggest that development identity or approval constitutes production permission.

Use the real PostgreSQL native journal. Initialize before readiness, and share
the same catalog, configuration, scope and journal registration across endpoint,
recovery and maintenance. An application-owned BackgroundService performs one
bounded `MaintainAsync` pass per tick with host cancellation and a pass deadline;
observe timeouts/failures without private payloads or an unbounded drain loop.
Maintenance never redispatches effects. Document multiple compatible registrations.

Provide explicit local-candidate preparation and run commands while registry
versions are unavailable. Own outputs and feeds; record exact package identities;
never silently resolve unpublished packages, fall back to workspace source or
overwrite public example manifests to hide candidate origin. Integrate build,
meaningful authentication/maintenance tests, lint and both real client smoke paths
with Nx. Keep provider credentials out of frontend configuration and artifacts.

## Documentation and C# reference

- Add mirrored starter instructions and a concise composition decision table:
  stateless/application workflow confirmations versus native mixed tools/MAF
  approvals; identify their distinct stores and maintenance responsibilities.
- Keep the currently published installation instructions truthful. Add an
  upcoming compatibility matrix identifying npm 0.9.0 + preview.2 as unreleased,
  supported cold recovery, stopped-worker upgrade requirements, explicit custom
  journal capability, uncertainty and application-owned authorization/idempotency.
  Explain exactly which installation instructions change only after publication.
- Publish a browsable C# reference from actual compiled XML documentation and the
  reviewed public API. Preserve overload IDs, summaries, parameters, returns,
  remarks and cross references. Do not present raw reflection metadata as C#.
  Retain existing API compatibility snapshots unchanged except reviewed legitimate
  metadata changes, and require generated reference freshness in SDK validation.
- Commit generated reference input outside `www/content/reference`, which the
  existing TypeScript collector resets. Website builds must consume that input
  without requiring a .NET SDK. Integrate routes, API menu, search and llms output
  using existing rendering/highlighting tools. No documentation framework or
  parser dependency is added.
- Release notes cover the prose rename and the .NET release pair. The existing
  teaser remains accurately labeled as a client replay, not a live .NET server.

## Acceptance and handoff

Write meaningful failing tests before behavior changes. Run affected Nx build,
test and lint targets, package acceptance, full source/cold browser gates, starter
client/server verification, documentation compilation and website route/layout
checks appropriate to new routes. Record actual results, warnings and unavailable
external qualifications separately. Independent specification and code-quality
reviews precede PR integration. Merge only the exact green head; resync if main
advances. Verify resulting main CI and documentation deployment. Finish with a
concrete release-session checklist; do not publish.

Not part of this work: AWS Bedrock OIDC repair, new release safeguards, .NET 8/9,
upstream reports, broad provider-hosted tools or reasoning-history support, mixed-
version rolling upgrades, or the user-deferred Azure-hosted managed identity run.
