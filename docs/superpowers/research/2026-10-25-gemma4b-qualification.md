# Gemma v4_4b native qualification

Status: user authorized downloading and qualifying Gemma `v4_4b` first. This is
a separate Chrome experiment from the default Nano route and the installed v4
`gemma4-2b-it` baseline. Cross-hardware work remains deferred.

## Fixed qualification procedure

Source starts at merged main `81595863cb5579a327c7186a427704c04830e7e0`
([PR #754](https://github.com/liveloveapp/hashbrown/pull/754)). Existing raw tool and phase tests/prompts are retained without retries, output
repair or relaxed assertions. Additional no-tool UI diagnostics were added after
the tool-creation gate failed; they do not substitute for the blocked tool suites. Same
Chrome 155.0.8059.85, M1 Max 32 GB, and dedicated non-personal test profile as
the 2B baseline. Runs are sequential to avoid concurrent model workloads.
The profile retains both components so prior evidence can be reproduced.

1. Run one strict raw native success case with `LOCAL_LLM_DOWNLOAD=1` and
   `LOCAL_LLM_CHROME_MODEL_VERSION=v4_4b`. Only this acquisition run permits
   downloads, through the existing trusted-click path and 20-minute create bound.
2. Record the actual downloaded component's manifest, base model identity and
   version. An accepted flag or availability alone does not establish identity.
3. Keep any strict ID failure. If native IDs remain empty, run the existing
   explicitly labeled single-call normalization compatibility probe for success,
   error and fresh-session success/error history across both framework projects.
   Otherwise run those strict cases. Do not change the adapter's batch safeguards.
4. Run the complete native transport workflows, including permissions, exact
   dependent receipts and Stop/fresh lookup, with downloads disabled.
5. Run the existing schema-finalization workflows with downloads disabled.
6. Run exactly two complete application-controlled UI phase samples (10 cases
   each), preserving each report before the next run. These include nested UI;
   a larger model does not justify weakening its heading, shape or count checks.
7. Preserve reports, raw event evidence, failures, session/reader cleanup and
   fallback observations in the task artifacts. Report model quality separately
   from adapter/renderer contracts. Investigate any implementation defect before
   changing code; keep model/runtime limitations visible.
8. Review and publish the findings in a PR, merge after required CI, and verify
   the merged tree. No new dependency or hosted fallback is introduced.

## Release verification

A fresh `gh release list`, NPM Publish workflow inventory, and
`npm view @hashbrownai/core version gitHead dist-tags --prefer-online --json`
agree on latest **0.8.1**, git head
`7b38a6074818c9f92b641242aec20dc8a7c2347e`. The last successful publish workflow
is run `40204138351` at `1a8159d613b863ca4077b947c0dd0afceef17234`.
The existing direct tarball inspection confirms native tools and schema
finalization are included, while `toolPhase`/`ChromeToolsTurnContext` are absent.
The release check is resolved from npm and GitHub; no manual version answer is
needed. The phase API on main awaits a later SDK release.

## Results

### Downloaded identity

The component was acquired in the initial strict probe, which took 536.4 seconds
including startup, acquisition and the failed create. Manifest identity is
`gemma-4-E4B-it`, base `2026.04.13.0000`, component `2026.7.28.1044`.
Weights are 3,659,518,480 bytes. This confirms the selected Gemma E4B component;
it does not identify Gemini Nano 4B.

### Native tools: creation gate fails

The initial strict probe failed before acquiring any session or emitting a tool
call: `InvalidStateError: The device is unable to create a session to run the
model. Please check the result of availability() first.` Acquired/destroyed
sessions were both zero. No tool handler ran, so no call-ID or replay capability
was established. The remaining normalized raw, transport tool/schema and two
phase samples were not run after this prerequisite failure; they are not passing
or skipped test results.

A fresh Stable diagnostic checked exact text-only and typed-tool configurations.
Both returned available. Text session creation succeeded; tool session creation
failed and the native model service disconnected. Chrome's on-device crash
counter incremented. No Ollama model was resident. The logs show LiteRT/WebGPU
initialization and a max_tokens fallback warning, but do not establish the
underlying crash cause; the OpenCL warning is not treated as proof of that cause.

An isolated APFS-cloned test profile in already-installed Canary 158.0.8122.0
reproduced the same boundary with the existing downloaded model: text create
succeeded, exact tools availability was available, and tool create disconnected
the service. Stable's profile was not migrated. No additional browser or model
was installed. This is same-device browser-version evidence; cross-hardware
qualification remains deferred.

A fresh v4 2B native tool control passed on the same Stable/device/profile using
the existing explicitly labeled single-call ID normalization. The failure is
therefore not evidence that all native tool configurations stopped working.

### Text and trusted UI without tools

The unchanged structured native suite passed 2/2 framework cases, each requiring
two requested-answer/count responses (answer contains the requested text; count
is exact). Added native text-transport UI canaries require exact
raw JSON and rendered leaf/nested trees, random titles, heading/count/order,
zero executable tools, one balanced session and no active readers/page errors or
HTTP fallback. All four cases passed after correcting a test observer that
mistook the fixture navigation's unencoded query string for a fallback request.
That first failed harness run is retained, and no model output assertion or
prompt was weakened. The corrected run also checks availability before any
creation/download and waits for final idle before inspecting cleanup.

The same four strict no-tools UI cases on v4 2B passed 3/4. In the failing
React leaf case, the raw native JSON itself contained two identical status
components despite the one-component request; the renderer accurately displayed
both. Errors/fallback were empty and its sole session was balanced. This is a
retained model cardinality failure, not evidence of a React rendering defect.

This qualifies those no-tool fixtures on Stable 155/E4B. It does not qualify
E4B native tool workflows, tool-plus-UI, arbitrary nested composition or another
hardware configuration. The existing 2B phase canaries remain unchanged.

### Upstream and interoperability follow-ups

A separate [Chromium report draft](2026-10-25-gemma4b-tool-session-report.md)
contains the raw create-only reproduction and text control. The user asked to
skip posting; the report remains a draft and no issue/comment was submitted.

The WebLLM image proposal is technically feasible without a dependency, but its
legacy serializer moves images before text. A bounded opt-in would accept only
images followed by trailing text, preserve current text types/engine ownership,
and reject unsupported layouts. Actual .85/.86 engine/worker consumer type
checks passed with strict TypeScript and skipLibCheck; full declaration checking
still reports missing upstream development declarations. This is protocol type
evidence, not runtime vision qualification. A separate WebLLM VLM download and
feature implementation remain future work.

Raw reports, model manifest, logs, controls, original failed observer run and
corrected UI evidence are retained in task artifacts under
`local-model-evidence/gemma4b-2026-10-25`.

## Final coverage and review

The complete no-tool E4B smoke suite subsequently passed **6/6** (two structured
fixture cases and four exact UI cases), without downloads, retries or skips.
The earlier corrected UI-only run passed 4/4. These are separate fixed runs, not
a guarantee over arbitrary requests. Independent review approved the new tests
and corrected the initial wording so structured-answer substring checks are not
described as exact raw structured-output checks.
