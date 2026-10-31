# Full Hashbrown integration conformance program

**Status:** approved by the user on 2026-10-30. Decisions below were selected
in conversation on 2026-10-30; this document does not claim implementation or
new framework compatibility.

## Agreed direction

- Cover the full Hashbrown integration, extending the activities/tool-display
  work into streaming, tools, approvals, state, structured output, generative UI
  and recovery.
- Keep AG-UI as the common agent-framework boundary. Native framework transports
  require their own designs and evidence.
- Deliver executable tests and a public, versioned compatibility matrix. Include
  executed results and planned coverage, with the latter explicitly untested.
- Extend LangGraph, Mastra and the maintained Microsoft Agent Framework host.
  Pydantic AI is the first additional framework. The user's subsequent
  "Pydantic" selection supersedes the earlier Google ADK selection.
- Use deterministic affected PR gates and weekly compatibility checks. This
  program does not replace existing nightly integration or .NET acceptance jobs.
- Keep file search deferred and Hashbrown release notes user-owned.

This is a program architecture with a bounded foundation milestone. Separate
implementation plans cover the foundation, Pydantic qualification and deeper
existing-framework scenarios; it is not one implementation PR for every cell.

## Problem and desired outcome

The existing conformance infrastructure already runs shared Angular and React
scenarios for streaming, client tools, structured output and trusted UI. The
agent-framework corpus adds seven real pinned LangGraph/Mastra profiles, raw
captures, prepared-store replay and browser checks. Microsoft Agent Framework
has a separate maintained .NET host with extensive native history and recovery
tests. These are complementary evidence sets, not interchangeable claims.

The next step is to make the coverage comparable and inspectable. A developer
should be able to choose a particular framework/bridge/configuration, see which
Hashbrown behaviors were qualified, reproduce the checks, and identify the exact
limit when something is missing. A framework logo or one successful tool call
must not imply support for every integration feature.

The current [framework display design](2026-10-29-agent-framework-display-design.md),
[corpus inventory](../../../tools/conformance/agent-frameworks/capabilities.json)
and [delivery closeout](../research/2026-10-29-tool-display-closeout.md) remain
the historical delivery evidence. The shared
[tool-step Rules](2026-10-21-b4-tool-step-contract-design.md#rules) remain binding.

## Approaches considered

1. **Shared capability profiles and framework drivers, selected.** Reuse
   framework-neutral expectations and the two existing browser hosts. Keep
   runtime-specific setup, model controls and durable state in small framework
   drivers. Additional libraries expand the same scenario catalog.
2. **Breadth-first framework smoke tests.** Faster to add many integrations, but
   insufficient evidence for ownership, execution timing, approval or restore.
   A discovery smoke can be useful without becoming a compatibility badge.
3. **Every framework/provider/version combination.** Too expensive for PR gates
   and difficult to interpret. Use selected producer profiles and protocol
   boundaries instead of an unrestricted Cartesian product.

## Architecture and ownership

### Shared scenario catalog

Extend `tools/conformance` rather than introduce another top-level test system.
Define stable scenario IDs, capability families, observable expectations and
required evidence stages. A scenario owns its behavioral assertions; framework
drivers cannot redefine "passed" to fit their output.

Keep framework model APIs out of the catalog. Drivers expose a small common
test interface: start an isolated scenario, attach a subscriber, wait for named
execution gates, release or cancel work, inspect native history, restart when
supported, and dispose resources. Gates observe real execution, not elapsed
sleep. Unsupported controls are declared as capability limits.

Existing shared browser scenarios stay in place. Extract reusable expectations
only where the same behavior is tested more than once. Avoid a universal runner
that reimplements each framework's orchestration or changes published APIs.

### Real framework drivers

Maintain isolated dependency and runtime manifests for each ecosystem. Reuse
the existing Node hosts and .NET service. Add Pydantic under an isolated Python
test host after its exact dependencies and runtime are approved. Hashbrown's
runtime packages gain no framework or B4 dependency.

Real frameworks and public bridge entry points execute against deterministic
models or controlled model servers. The model response is scripted; tool
execution, framework state, serialization and bridge output are real. A native
framework SDK seam, in-process bridge, HTTP server and durable restart are
distinct profiles, even when they produce similar event captures.

Pure protocol fault injection remains a separate consumer/transport profile.
It can test malformed patches or duplicate delivery without claiming that a
real framework emitted those events.

### Evidence pipeline

For each advertised capability, retain the applicable stages:

1. **Producer execution:** actual tool/agent callbacks, gate observations and
   native results establish what ran and when.
2. **Bridge and wire:** capture unmodified events and, for endpoint claims,
   real requests/responses through the actual HTTP streaming endpoint.
3. **Core consumer:** feed events through the real root store with action
   preparation and public projection. Assert state and ownership.
4. **Canonical persistence:** commit, serialize, restore and compare relevant
   canonical state; inspect the next outgoing request separately.
5. **Browser behavior:** run both existing production Angular and React hosts
   and assert visible behavior and application handler counts.
6. **Native recovery:** where claimed, restart the actual backend from durable
   state and run again. Consumer JSON restore alone cannot satisfy this stage.

Capture integrity hashes protect retained raw bytes. Semantic comparison may
normalize generated envelope identities consistently, preserving relationships
and application payloads. Every additional normalization rule is profile-local,
explicit and tested. Never edit a producer trace to manufacture a missing field.

## Capability families and representative scenarios

| Family                     | Representative observable behavior                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation and streaming | Text deltas before completion; multi-turn history; independent message identity; a silent but valid run; bounded handling of abnormal EOF.                                                                                       |
| Server and client tools    | Partial arguments; gated execution; parallel/dependent calls; results and useful failures; explicit provider identity; same-name server calls remain inert while an independent client tool executes once.                       |
| Approval and control       | Allow, deny, cancel and resume; pending arguments versus execution start; no duplicate side effect after resume; stale/duplicate decisions do not acquire a new owner.                                                           |
| Shared state               | Snapshot and ordered patch updates; app-to-agent input where supported; no cross-thread leakage; invalid-patch behavior tested at its owning boundary.                                                                           |
| Structured output          | Complete and partial schema-constrained data; validation failure; multi-turn continuation. Backend structured output and consumer parsing receive separate evidence.                                                             |
| Generative UI              | Trusted components and validated props; progressive/nested rendering where supported; cancellation and restore; unknown components and invalid props never gain execution authority.                                             |
| Media and attachments      | Supported typed input/history parts; preservation through the bridge; cancellation during asset acquisition and resource cleanup. Handling an image or audio part does not prove model perception quality or enable file search. |
| Activities and rich steps  | Native activity snapshots/deltas; non-tool progress stays an activity; labels, custom icons and actual status transitions; source/citation/attribution preservation.                                                             |
| Subagents and delegation   | Real child execution; standard lifecycle/provenance where supplied; parent/child settlement independence; parallel children and cancellation ownership.                                                                          |
| Recovery and isolation     | Browser reload, reconnect, approval resume and durable server restart as separate capabilities; next-turn native history; two concurrent threads with no mixed outputs or cross-dispatch.                                        |

The catalog covers the full integration. That does not make every capability
mandatory for every framework. Basic AG-UI must work without `b4.step` or
`b4.answer`; rich-contract profiles are explicit opt-ins. Native structured
output, an application recipe for producing Hashbrown UI, and arbitrary
upstream structured content must not be reported as the same capability.

Preserve the established rules for ordinary matching client tools. Only explicit
provider classification overrides matching application tools; classification
cannot be inferred from a tool name, error text or a nested thread ID.

Adversarial consumer cases include duplicated deliveries, conflicting ownership,
missing terminals and late events after cancellation. Reject or preserve them
according to the existing contract; do not impose a universal ordering rule on
frameworks whose protocols do not specify it. Performance evidence uses causal
gates such as START-before-return, not a new millisecond benchmark promise.

## Profiles, qualification and run health

A profile identifies a framework, language, bridge, transport mode, protocol
version and relevant options. Each qualification binds it to exact tested
framework/bridge/transitive versions, Hashbrown source or released artifacts,
runtime/platform, scenario revision and recipe identity when present.

Record these capability states independently from CI health:

| State              | Required meaning                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passed`           | Required scenario stages passed for the named versioned configuration.                                                                                |
| `recipe-required`  | The native profile needs enrichment to satisfy the capability. This state alone makes no claim that a recipe exists or passed.                        |
| `missing-upstream` | Real execution demonstrated missing producer/bridge information. Link the demonstrated gap; source inspection alone cannot create execution evidence. |
| `unsupported`      | The integration explicitly lacks the capability, with an authoritative reason and evidence type. A failed probe alone is not enough.                  |
| `not-tested`       | No sufficient execution evidence. This is also the initial state for planned coverage.                                                                |
| `deferred`         | Intentionally excluded from current delivery, including file search.                                                                                  |

An executed recipe has its own profile, with recipe identity and version, whose
capability can become `passed` after all required stages succeed. The public
label is "passed with recipe"; the native profile remains separate. In
particular, preserve the existing LangGraph native-progress/activity
`recipe-required` observation as an unqualified enrichment gap. Do not migrate
that value into a claim of tested recipe support.

Scenario results separately record `pass`, `fail`, `infrastructure-error` or
`not-run`, with a reason and stage. A regression that proves a known producer
gap may pass while its capability remains `missing-upstream`. An unexpected
failure cannot silently change an expected passing cell into a documented gap.
Infrastructure failures must not become unsupported capability claims or skipped
green tests. An intentionally interrupted scenario can pass only by satisfying
its expected cancellation/EOF assertions, not by suppressing its test failure.

A cell may retain a dated last qualification alongside a failed newer attempt.
Never present that historical qualification as a clean result for the attempted
new version. Avoid an overall framework "fully supported" badge.

## Public compatibility matrix

The matrix includes executed profiles and a clearly marked planned catalog.
Pydantic AI starts as `not-tested`, not compatible by design. Existing qualified
cells import their actual evidence without expanding its scope. Planned
candidates initially include Google ADK and Strands, followed by discovery rows
for CrewAI, AG2, Agno, LlamaIndex, Vercel AI SDK and agent SDKs with a viable
bridge. A native-only SDK requires a separate bridge/transport investigation.
Listing a candidate is neither a promise to implement it nor a dependency approval.

Use one reviewed, machine-readable profile/evidence inventory to generate both
React and Angular documentation views. Reuse the existing `capabilities.json`
with a validated migration or a versioned successor in the same directory;
do not maintain a separate hand-authored table. The implementation plan chooses
the schema layout while preserving existing profile IDs and corpus consumers.

Every passed cell links to the exact versions/configuration, scenario IDs,
evidence stages, qualification date, source commit and durable evidence paths.
Show React/Angular separately if they differ. Show native and recipe profiles
separately, with recovery levels visible. Source audits and prior art remain
research links, not passing cells.

Checked-in qualification records and compact sanitized evidence summaries are
the durable publication input. Raw captures remain checked in where practical;
larger logs/browser diagnostics are CI artifacts with retention and expiry
disclosed. Do not rely solely on an expiring artifact to justify a green cell.

The website build validates and renders reviewed records without installing or
executing agent frameworks. Label results "last qualified" and link the weekly
workflow/report for current attempts. Weekly execution does not directly rewrite
public claims or website files. Promote new version qualifications through a
reviewed PR with retained evidence. There is no live status service or new database.

## CI and version compatibility

### Affected PR gates

Pinned deterministic profiles participate in the existing Nx affected pipeline.
Common core, Angular/React consumer, scenario catalog and harness changes must
select all dependent qualified profiles. A driver-only change selects its
framework and shared consumers; a documentation-only matrix change selects
schema/generation/documentation checks rather than installing every framework.
Changes to locks, runtime pins, recipes, captures, evidence records or CI setup
must be declared Nx inputs so a stale cache cannot qualify a new configuration.

Add Python setup through the existing CI task-graph fixture selection pattern;
do not install Python dependencies for unrelated PRs. Reuse maintained .NET
selection and acceptance. Test the selection itself with relevant and unrelated
change examples, including common core changes.

Capture regeneration is explicit and reviewed. CI verifies retained captures
against fresh real execution where required; it does not overwrite fixtures to
make itself green. Previously qualified mandatory scenarios gate affected PRs.
New capabilities remain unqualified until their first reviewed execution.

### Weekly compatibility checks

Run once per week on protected main, with manual dispatch for reproductions.
This is a repository workflow proposed for implementation, not an automation
created by this design session. Keep existing nightly jobs unchanged.

Each framework job runs the pinned baseline plus at most one latest compatible
stable candidate within its reviewed dependency/runtime constraints. Resolve
and retain exact candidate versions and a complete isolated lock before testing.
Do not float root dependencies, mutate tracked locks or select unapproved new
major versions. If baseline and candidate resolve identically, run one profile
and identify the deduplication in the report. Planned frameworks are not installed.

Baseline failures and candidate failures are both visible; label which set failed.
Weekly jobs produce a machine-readable report and readable Actions summary,
retaining successful, failed and infrastructure-error attempts. They do not
auto-update dependencies, open upstream reports or send messages. New packages
and changes to approved dependency sets require the normal AGENTS approval.

PR gate runs remain reproducible from locks. Weekly candidate runs are separate
evidence and must not be mistaken for the required PR result. Keep isolated jobs
and bounded cleanup; one broken ecosystem must not prevent the other reports
from being collected. Set per-job deadlines based on the actual scenario groups
in the implementation plan, without extending them to disguise failures.

Live paid-provider/model quality checks are outside this deterministic program.
Any later canary needs separate opt-in, credentials and an explicit claim about
what it validates. No live recordings are needed.

## Pydantic AI first qualification

Use the public AG-UI adapter through an actual isolated ASGI streaming endpoint,
with controlled model behavior and actual Python tool callbacks. Bind the exact
Python, Pydantic AI, `ag-ui-protocol` and server versions before installing them.
No new package dependencies are approved by this design alone.

Upstream documentation describes the AG-UI adapter and protocol negotiation,
including different cancellation behavior for an explicit server cancellation
and a client disconnect. These are investigation targets, not results for our
future pins. Record the requested and effective protocol version; do not silently
upgrade protocol behavior or infer a cancelled outcome from a closed stream.

Start with streaming text, gated server tools, an independent browser-tool
round trip, explicit failure, cancellation and multi-turn history in both
consumers. Then qualify approval/resume, state and structured-output/UI profiles
separately. For optional rich activities, citations or subagents, either prove
the native bridge emits the required data or name the tested recipe/gap.
Application-controlled structured output and trusted UI require actual
Hashbrown component/schema validation, not just a Python object in a response.

Durable restart requires persistent server-owned state and a second process;
serializing messages in the test process is insufficient. Keep that profile
unqualified until the actual storage/resume path is implemented and tested.

References inspected on 2026-10-30:

- [Pydantic AI AG-UI integration](https://pydantic.dev/docs/ai/integrations/ui/ag-ui/).
- [AG-UI integration inventory](https://docs.ag-ui.com/introduction).

Documentation and library APIs may advance independently of the selected pins.
The executable profile, not the latest documentation, determines public claims.

## Delivery boundaries and acceptance

1. **Foundation:** catalog and evidence schema, validation, report generation,
   public documentation projection, migration of the seven existing profiles
   with no stronger claims, planned Pydantic/other rows, and tested Nx selection.
   A false passed claim, missing evidence or a stale generated matrix must fail
   validation. Model the wider capability families without requiring them all
   to pass before publishing the inventory.
2. **Pydantic baseline:** separately approved isolated Python dependencies and
   real HTTP host; execute the baseline above through the prepared store and
   both browsers; retain captures/results and publish the precise profile.
   Wire its deterministic affected gates and weekly baseline/candidate checks.
3. **Existing-framework depth:** separate changes for LangGraph API-server/
   Python/native restart, Mastra control/state/richer profiles and the existing
   .NET host's display gaps. Select concrete scenarios in each implementation
   plan; reuse their maintained recovery mechanisms.
4. **Broader capability and framework slices:** qualify state, structured output,
   generative UI, provenance and recovery profiles as evidence permits. Google
   ADK is a next candidate, not a second new framework bundled into Pydantic work.

Foundation acceptance does not claim Pydantic execution. Pydantic baseline
acceptance does not claim the entire capability catalog. Each slice updates the
same matrix and keeps gaps visible. Weekly checks are introduced for qualified
framework profiles, using approved version ranges and artifact/report contracts.

The existing B4 shared fixtures remain the rich-step contract oracle. Extend
their consumer evidence as needed without adding a B4 runtime requirement or
changing shared contract ownership. Other model-provider coverage and local
browser-model suites remain separately identified evidence.

## Validation and repository conventions

Implementation follows AGENTS.md: test-first changes, top-level JavaScript/
TypeScript `test(...)` with arrange/act/assert, no test lifecycle hooks, TSDoc
for new reusable exports, and approval before dependency additions. Python
assertions use isolated explicit setup/cleanup and expose results through the
same scenario/evidence contract; no hidden shared test state.

Tests must reject contradictory capability/evidence records, recipe/native
conflation, unqualified version promotion and claimed recovery without its
required stages. Verify public generation determinism and accessible table
labels in both documentation views. Exercise missing/failed evidence without
rewriting expected results, and check that runtime packages gain no framework
dependencies.

Run build/test/lint for every affected package and the appropriate existing
conformance/browser/website targets. Changes to core, framework packages or
the maintained .NET host retain their existing package and acceptance gates.
The implementation plans must identify the exact Nx targets for each slice.

## Explicit exclusions

- File search, new store configuration and Hashbrown release notes.
- New native framework transports, orchestration engines or production adapters.
- Simultaneous qualification of every framework/provider/version combination.
- Automatic upstream posting, dependency upgrades or unreviewed support claims.
- A public dashboard service, database, model-quality benchmark or flaky timing
  league table.

The approved foundation implementation and verification are tracked in the
[foundation plan](../plans/2026-10-30-conformance-foundation.md). The separately approved [Pydantic baseline plan](../plans/2026-10-31-pydantic-ai-qualification.md) adds real HTTP producer, prepared-store and both browser qualifications for selected scenarios, with native gaps retained. Broader Python capabilities and native recovery remain separate, unstarted slices. File search remains deferred.
