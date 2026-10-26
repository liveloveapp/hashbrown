# Local tools followed by component UI

The user approved the tools-gather-data-then-component-UI design on October 25,
2026 and authorized implementation, PR, merge on green and verification. Reuse
the existing task worktree and branch `blove/local-component-ui-tools`. Add no
dependency. The [research](../research/2026-10-25-local-component-ui-tools.md)
records alternatives and evidence limitations.

## API and behavior

Enable the existing `useUiChat` / `uiChatResource` component schema with
`experimental_chrome_tools({ schemaFinalization: 'after-tool-planning' })`.
No component-as-tool API, new wire format or handler-side rendering. Preserve
default rejection. A UI request must provide an object response schema before
creating a native session. This is adapter support, not proof of model inference
or arbitrary recursive JSON Schema support. Media composition remains rejected.

Normal framework tools gather authoritative data through arbitrary planning
rounds. Planning has no constraint and its prose stays hidden. A call-free
planning turn triggers one terminal constrained prompt on the same native
session. With no tools, constrain the authoritative input directly. Forward the
exact component schema; stream final text to Skillet and existing framework
renderers. Reject typed calls/unknown chunks during finalization. No JSON repair,
schema weakening, silent retry, hosted fallback or transport handler execution.

Keep canonical history, cancellation markers, ID repair limits, resource bounds,
whole-run timeout and teardown behavior. UI cancellation uses existing rollback
semantics; tests must verify no stale card survives recovery. Component registry
retention/narrowing policy stays unchanged. Detection reports UI adapter support
only for the opt-in, and inference remains unknown.

## Verification

Core test-first cases cover gated UI acceptance, schema-required rejection before
creation, unchanged default, phase constraints and capability reporting. The
existing shared stream tests retain finalization call rejection and abort cases.

Add a local UI fixture to each actual framework host with schema-exposed trusted
leaf and container components and normal lookup/dependent tools. Use exact random
tokens/receipts in generated props. Assert actual DOM, parsed UI, canonical replay,
phase options and handler order. Local aimock scenarios also cover progressive
rendering, malformed/disallowed UI, invalid props, unexpected terminal tool calls,
Stop during planning/finalization and recovery. Keep these targets out of CI,
uncached, opt-in and single-worker. Include no-tools direct constrained UI and a
bounded parent/child case. Treat unrestricted recursive composition as a separate
probe, and document real native failures without claiming general support.

Run downloaded v4 cases with no downloads/fallback and raw evidence retention.
Repeat successful workflows on explicit production builds. Run affected
build/test/lint/API checks, standard conformance and local regressions. Review and
address feedback, open/attach PR, wait for exact-head green CI, merge, compare
reviewed and merged trees and verify main. Do not publish a package release.

## Approved bounded qualification

After the broad-catalog quality failures, the user approved narrowing actual tool
and component declarations per workflow and retaining the failures as research.
Lookup, stream, error and Stop fixtures offer only lookup + status. Dependent
fixtures offer lookup/follow + status. Bounded nesting offers lookup +
status/panel, and no-tools offers status alone. Keep a separate explicit broad
catalog option for research; do not change runtime component-retention policy.

Assert exact tool declarations and component schemas as well as the unchanged
operation counts, handler-result provenance, raw JSON, parsed trees, DOM and
resource checks. Predetermine two full eight-case native production samples
against the same code, instructions and downloaded profile. Record every failure;
do not repeat unchanged samples until a passing pair appears. A passing bounded
sample qualifies only the measured workflows and model version. General
broad-catalog reliability and arbitrary recursion remain unverified.
