# ATC B4 merged-source requalification and rollout follow-ups

This report records the earlier local-requalification phase. Later hosted executions and their limitations are in the [managed-readiness follow-ups](./2026-10-29-atc-b4-managed-readiness-followups.md).

[PR #828](https://github.com/liveloveapp/hashbrown/pull/828) was normally squash-merged on 2026-10-29 at 19:23:02 UTC as `a2f92a4f02ab1dfc38051a44e509afb439634793`. Its updated exact head `151d16df9c639d4c91d47d8167c5d63f96815f72` passed normal required CI [40939268749](https://github.com/liveloveapp/hashbrown/actions/runs/40939268749). No bypass or policy change was used. Production B4 was not enabled.

This follow-up freezes that merge rather than following moving main. [Sanitized evidence](./2026-10-29-atc-b4-merged-source-requalification-evidence.json) records the exact checks and hashes. The [new fault-test design](../specs/2026-10-29-atc-b4-rollout-followups-design.md) is proposed and independently reviewed; its new fault scenarios and additional request budget had not executed at that phase.

## Source assessment and local checks

Since the previously tested `6d414a37d25ab336192e52fd4d00b26321758ee7`, main added OpenAI/Azure code execution, core tool-result failure preservation, and documentation/site changes. ATC source and the root dependency lockfile remained unchanged. ATC does not opt into the new built-in code-execution feature. The core reducer changes can affect browser consumption and were included in regression checks.

On a clean isolated exact-source checkout, installation used the published unchanged lockfile with lifecycle scripts disabled. Fresh uncached build, test and lint passed for core, OpenAI, ATC server and ATC shared code. All 86 real browser fixture cases passed across Angular, React and both backend fixtures; these are deterministic browser checks, not additional hosted model traffic. The complete B4 artifact build and its eight prerequisites passed. Existing npm deprecation and framework/build advisories remain; no suppressions, dependency, runtime, workflow or policy edits were made.

The rebuilt B4 `atc.mjs` SHA256 remains `864c94a387056c4c8f940ac14b9a961603d9d340772dfbeb3056f6860adafc14`. The raw complete function-tree SHA256 is now `376e86a3445d342b3b327154e232e13f747124cafe5fc8ad48af8440ade19f86`, and differs from the earlier tree. An exhaustive entry comparison found four entries in each tree with identical types/modes; only `index.mjs` differs. Exactly 90 bytes differ, confined to three generated single-line source-label comments containing a random build UUID. Replacing only those three anchored comment labels yields identical complete wrapper bytes with SHA256 `77bda30aac67047097c70699b4276986299a0b00774f6259f44cef122e3530d0`. Artifacts were not rewritten. The full output tree differs because browser/provider outputs changed as well.

This establishes unchanged executable B4 function content plus new local browser/provider regression evidence. It does not create new hosted execution evidence or establish raw full-tree equality. The earlier recovery/load results remain bound to their recorded old source, raw hashes and deployment IDs. A future new deployment must bind its own actual raw hashes and manifest.

## Configuration and remaining decisions

Authenticated read-only Vercel metadata for the exact hashbrown-atc project/team showed fluid compute in iad1 with a 60-second default function duration. The B4 cookie/database environment keys target preview only; there was no production ATC_CHAT_BACKEND key. Production secret values were not pulled, and no environment settings or aliases were changed. This metadata alone does not validate a prospective production DSN or cookie value.

The reviewed proposed follow-up uses supported Vercel invocation timeout, disposable Neon compute restart and a preview-only rollback rehearsal. Invocation timeout does not prove physical worker death; compute restart does not prove storage failover. Physical platform/HA failures remain outside those claims. The new design proposes a separate aggregate maximum of 16 additional requests, explicitly requiring approval; the historical 99/120 load and 10/16 recovery ledgers are preserved.

Neon management access and an independently verified disposable compute are required before restart testing. The existing shared preview compute must not be restarted as a shortcut. Initial production traffic, latency/error objectives, provider-spend limits and operational owners still need human input; the bounded preview workload cannot invent those targets.

Rollback requires a verified OpenAI artifact, not an environment-only toggle on a packaged B4 deployment. The existing offline retention command requires admission disabled and every agent instance stopped. No global cleanup or production maintenance operation was performed.

No new hosted calls, deployment, alias mutation, fault injection or preview credential pull occurred in this source-requalification phase. Original user workspaces and credential files were untouched. B4 remains disabled in production.
