# Chrome native tools with opt-in schema finalization

User-authorized follow-up to [native tools](2026-10-24-chrome-native-tools.md)
and [cancellation history](2026-10-24-cancelled-turn-markers.md). The selected
public policy is `experimental_chrome_tools({ schemaFinalization:
'after-tool-planning' })`, used with the existing `useStructuredChat` or
`structuredChatResource` schema. No dependency or framework API was added.

## Why separate phases

The earlier raw simultaneous schema/tools prompt skipped the required tool.
A later raw tools-then-schema sample succeeded once. The implemented policy
keeps planning unconstrained across arbitrary framework-owned tool rounds,
then constrains a separate final prompt only after a call-free planning turn.
This preserves dependent tools rather than assuming the first result ends
planning. It adds one terminal model pass when tools are declared. With no
tools, the authoritative input is constrained directly.

Planning prose and the synthetic finalization instruction stay local to the
native session. Canonical history retains real users, calls, results and final
answers. Only validated call batches reach application handlers; finalization
rejects every non-text chunk, including further tool calls. Final text is
streamed untouched to Skillet. No fence stripping, weaker-constraint retry or
fallback is used. Defaults continue to reject schema-plus-tools; UI/media
composition remains unsupported even with the opt-in.

The [Prompt API draft](https://webmachinelearning.github.io/prompt-api/)
defines per-prompt response constraints and session-scoped tools. It permits
tool output even when a constraint is present, so finalization cannot assume
the browser disables tools. Capability reporting describes adapter policy and
exact native options, with inference still explicitly `unknown`.

## Test-first and review evidence

- Core tests first failed at the missing opt-in/rejection boundary
  (`/tmp/hashbrown-schema-core-red-runtime.log`). Final focused tests passed
  61/61, and the full suite passed 1,809 tests across 88 suites and 14 snapshots.
  Build, lint and API reporting passed. Lint retains three existing unused
  variables in `tool-step.ts`; existing API Extractor missing-release/export and
  compiler-version warnings remain. Core implementation received independent
  spec and quality approval.
- Both actual framework lookup tests first failed before the new fixture
  route existed (`/tmp/hashbrown-schema-browser-red.log`). The first complete
  contract run passed positive and Stop cases but caught a fixture serializing
  an empty placeholder as `""`; only fixture rendering changed. Malformed model
  output and finalization calls already failed correctly without extra effects.
- Review strengthened dependent assertions to require exactly `lookup_secret`
  then `follow_secret`, exact token correlation, a real receipt and final
  equality to that receipt. Two lookups cannot pass as a dependent workflow.
- Final contracts passed all 10 cases, no skips/flakes/unexpected failures:
  `/tmp/hashbrown-schema-contracts-verified.log` and retained report/evidence
  `/tmp/hashbrown-schema-contracts-evidence/`. Cases verify phase constraints,
  parsed hidden tokens/receipts, next-run canonical replay without planning or
  synthetic text, rejected final calls/malformed output, and Stop/recovery.
  Sessions balanced in every case, with zero active readers/errors/fallbacks.
- The shim retains within-session history, forwards constraints for inspection,
  and never enforces constraints or rewrites model output. The real observer
  records native prompt options and prototype-backed call values.

## Installed v4 result

All four strict real-framework cases passed on the already downloaded Chrome
155/v4 profile `/tmp/hashbrown-native-tools-model-profile`, with downloads
refused and experimental tool-use/v4 flags scoped to that profile. The suite
took 76.46 seconds. Evidence is retained under
`/tmp/hashbrown-schema-v4-evidence/`, including the original live report and
raw prompts/options/chunks; command output is `/tmp/hashbrown-schema-v4.log`.

| Framework | Workflow | Time | Native prompts | Constrained prompts | Sessions created/destroyed |
| --- | --- | --- | --- | --- | --- |
| Angular | lookup | 28.387s | 3 | 1, terminal only | 2/2 |
| Angular | dependent | 12.919s | 4 | 1, terminal only | 3/3 |
| React | lookup | 11.419s | 3 | 1, terminal only | 2/2 |
| React | dependent | 18.931s | 4 | 1, terminal only | 3/3 |

Every case returned the exact hidden random tool value in both raw native JSON
and the parsed framework answer, executed the expected handlers in order,
closed all sessions, returned to zero active readers and recorded zero page
errors or hosted fallback requests. These are bounded quality samples; they do
not prove arbitrary JSON Schema grammar support, generative UI, larger plans,
repeatability across hardware/model versions or general model obedience.
The earlier unconstrained formatting failures remain valid historical evidence
and are not regraded by this separate opt-in suite.

A second run against freshly rebuilt, explicit production bundles passed the
same four strict cases in 76.25 seconds, with new hidden random values. Terminal
constraints, exact handler order/results, balanced sessions, zero active readers
and zero page errors/fallbacks were verified again. Retained evidence:
`/tmp/hashbrown-schema-v4-production-evidence/`; output:
`/tmp/hashbrown-schema-v4-production.log`. This is two successful samples of
each case, rather than eight distinct scenarios.

Run locally:

```sh
NODE_ENV=production LOCAL_LLM_E2E=1 npx nx local-native-schema-contract-e2e conformance
NODE_ENV=production LOCAL_LLM_E2E=1 LOCAL_LLM_PROFILE=/tmp/hashbrown-native-tools-model-profile \
  npx nx local-native-schema-workflow-smoke conformance
```

Targets refuse CI through their shared native-tools configuration, run one
browser at a time and disable caching. Freshly built dependencies were verified
before the measured runs used `--excludeTaskDependencies`; no assertions,
model options or inference steps were skipped.

## Regression and build verification

The final explicit production build passed the 10 new schema contracts, the
four real v4 cases, all 18 existing native-tools workflows, 24 existing local
transport contracts and four media contracts. Standard browser conformance
passed 64/64 and provider conformance passed 8/8, covering the 72 cases in the
combined standard suite. Logs use `/tmp/hashbrown-schema-*-production.log`.
No local-model targets were added to CI.

React's 210 and Angular's 278 unit tests passed, as did conformance's 45 tests,
framework/package and both host builds, applicable lint targets and all four
conformance TypeScript configurations. The docs production build/lint and all
860 site tests passed. Existing build/API deprecation, chunk-size and
release/export warnings remain visible.

Two environmental checks were corrected without changing product code or
weakening assertions: localhost unit tests were rerun with permission to bind
their test servers, and the initial host build without an explicit production
environment failed the React no-development-collection assertion. Fresh
`NODE_ENV=production` builds then passed every standard check. New commands
document that environment. A cold site run hit the unchanged search-overlay
10-second lazy-import timeout (859/860); the full rerun passed with two workers
after concurrent builds finished. Neither the assertion nor timeout changed.
