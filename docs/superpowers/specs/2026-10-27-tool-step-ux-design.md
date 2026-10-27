# Headless tool-step UX helpers

## Scope and prior work

This implements the pure UX portion of slice 6 in the approved
`2026-10-21-b4-tool-step-contract-design.md`. Its Rules remain binding.
Baseline: Hashbrown main `e5af35fe`. The activity model and `groupTurns`, the
shared step reader/conformance suite, provider steps/native replay, Google
attribution, and plain LangGraph guidance have landed. B4 provider built-ins
landed in cacheplane/b4run#1114. The old slice-1 checklist and memory note do not
reflect those completed slices.

Hashbrown remains headless. Add no components, runtime dependency on B4, new
dependencies, automatic timers, or release notes. Keep file search deferred.
The user confirmed on 2026-10-27 that SUBAGENT_* lifecycle/output attribution
is the next slice, after these UX helpers. It is not part of this PR.

## Public API

Implement in small leaf modules under `packages/core/src/models`, exported from
core and re-exported from React and Angular. All public types are neutral,
documented, and free of `ɵ` or B4 type names. Re-export existing `groupTurns` and
`Turn` through the two framework entrypoints alongside the new helpers.

### Labels and grouping

`ServerToolCallLabelOverrides` is a readonly record keyed by technical tool
name. An entry has optional `label(call)` and `group(calls)` callbacks returning
a string or undefined. Trim returned text before applying length bounds. Use own-key lookup only. A callback that throws, returns
a non-string at runtime, or returns blank text falls back safely.

`getServerToolCallLabel(call, overrides?)` chooses the app override, then the
producer label, then generic wording: `Using X…`, `Used X`, `X failed`,
`Denied X`, or `Cancelled X`. It reads the public lifecycle/outcome, with
rejected results recognized for legacy complete calls without an outcome.
Never echo arguments or results in a fallback. Bound every returned label to
120 Unicode code points, using an ellipsis when truncated.

`groupServerToolCalls(calls, options?)` returns a readonly array of original
`Chat.ServerToolCall` objects or `ServerToolCallGroup` records. A group has
`kind: 'group'`, `name`, `label`, `calls`, and deduplicated `sources`.
Options have `labels` and an optional readonly `exclude` list of tool names.

Only two or more consecutive successful complete calls may group. Open,
failed, denied, cancelled, rejected-result and explicitly excluded calls break
a run. Do not combine different names, kinds, built-ins, providers or parent
tool-call identities. Provider identity is read internally from existing step
metadata; do not expose a private type. Do not hardcode B4 application tool
names. Apps can exclude delegation/planning tools such as `task`/`writeTodos`.

A group uses its app group override, else a conservative common-verb phrase
from resolved member labels, else `Used X N times`. The common-verb form uses the longest shared
leading-word prefix and accepts only short distinct trailing subjects (at most four words/32 code points, no
comma/semicolon/colon, not truncated), strips a trailing parenthetical, shows
up to three subjects, and otherwise shows the first two and `N more`. Group
labels obey the same length bound. Grouping preserves order, all original call
objects, and all source identities; it never changes call state.

### Sources and attribution

`collectTurnSources(turn)` collects assistant-level call-less sources and
server-call sources across the existing `Turn<M>`. Deduplicate by source id,
visit each assistant’s own sources first and then its server calls in order, retain first occurrence/order, and never deduplicate by URL or title. Return
original source objects through readonly types.

`collectTurnAttributions(turn)` returns readonly `TurnAttribution` records:
`{ assistantMessageId, attribution }`, one for every attribution item in
assistant order. Preserve original attribution objects, HTML and widget tokens
verbatim. Do not deduplicate across messages, sanitize, combine, restyle or
interpret markup. The owner id lets an app render each item beside the correct
answer; an attribution is not a source or a citation. HTML rendering remains
the application's responsibility and requires a trusted provider/backend.

### Timing

`formatDuration(milliseconds: number | undefined)` follows B4's compact format:
`<1s`, `Ns`, `Nm Ms`. Floor whole seconds (1,999 ms is `1s`); 60,000 ms is `1m 0s` and 3,600,000 ms is `60m 0s`. Undefined, negative and non-finite values return undefined.

Export `NO_FLASH_MS = 300` and `ELAPSED_TICK_MS = 1000`.
`noFlashRemaining(startedAt: number | undefined, now: number)` returns the
remaining window, clamped at zero, or undefined for unknown/non-finite times or
a start later than now. Inputs must use the same clock. No helper reads the
wall clock or creates a timer, and no-flash behavior never discards a call.

### Turn summary

`summarizeTurn(turn, options?)` returns `TurnSummary`: `status`, `text`, `meta`,
`live`, `toolCallCount`, `sourceCount`, `failedToolCallCount`,
`deniedToolCallCount`, `cancelledToolCallCount`, and optional `durationMs`.
Counts include client and server tool calls; sources use `collectTurnSources`.
A failed tool does not by itself make the whole turn fail.

`TurnSummaryOptions` accepts `status` (`working | awaiting | complete | failed |
cancelled`), `labels`, `startedAt`, `settledAt`, and `now`. An explicit status
wins. Otherwise a synthetic run-error message means failed, even when a client call remains pending; open calls then mean working, and a turn with no open calls/errors is complete. Caller status is
needed for text-only streaming and approval/cancellation state not represented
by the turn's message list.

Working text uses the newest open server call's resolved label, preferring
known execution start times when both candidates have them; if either time is unknown, the later call in input order wins. Fall back to `Working` when no server call is open.
Awaiting reads `Waiting for your approval`. Failed/cancelled read
`Work failed`/`Stopped`, with elapsed wording when known. Complete reads
`Worked` or `Worked for D`. Meta reports tool-call/source/bad-outcome counts;
working/awaiting meta may show elapsed time. Only working is live.

Duration comes only from caller-supplied turn times: settledAt minus startedAt,
or now minus startedAt while working/awaiting. Do not invent a turn start from
the first tool call or a finish from the last call. Invalid/unknown durations
stay absent. The summary is a projection and never mutates or settles state.

## Upstream AG-UI

Upstream means the shared `ag-ui-protocol/ag-ui` project, not a Hashbrown
renderer dependency. #2146 is the open display-name proposal; #2161 is a
discussion about protocol direction. The standard now documents subagent
lifecycle and provenance, but Hashbrown does not implement that lifecycle yet.
Record compatibility gaps and examples locally. Do not file issues, comment on
discussions, change the wire contract or wait for upstream adoption here.

## Verification and delivery

Use top-level test(...) and arrange/act/assert. Write and run failing tests
before implementation. Cover readonly inputs, stable order/reference identity,
all lifecycle/outcome combinations, grouping barriers/provider separation,
prototype-like names, callback failure/blank labels, Unicode truncation, source
identity, attribution ownership/verbatim markup, explicit clocks and unknown
timing, and summary status/counting without false success.

Update both framework activity/functions guides with pure derived-state
examples and provider attribution obligations. Generate API reports. Run build,
test and lint for affected packages, core/Angular e2e, framework distribution
checks where defined, and the relevant docs checks. No live recordings/keys.
Open a PR and report warnings; do not infer merge authorization for this new PR
from the user's authorization to merge B4 #1114.
