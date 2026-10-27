# Published SDK 0.8.3 .NET qualification plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Qualify published SDK 0.8.3 against the current .NET recipe across React, Angular, OpenAI and Azure.

**Architecture:** Keep the existing reviewed isolated consumer and bounded live runner. Change only the three existing SDK pins and their registry lock records, exact-version validation, corresponding tests and current runner instructions. Preserve the historical 0.8.2 diagnostic minimum and prior validation records. No new dependencies, release, cloud managed identity run or release safeguards. This supersedes only the existing specification’s exact 0.8.2 baseline with 0.8.3; its opt-in, 87-call reservation/128-call maximum, no automatic reruns, deadlines, redaction and mandatory preflight/native proof requirements remain unchanged.

**Tech Stack:** Nx, .NET 10, PostgreSQL 18, Playwright, published npm SDKs 0.8.3.

### Task 1: Exact published consumer baseline

**Files:** `tools/conformance/dotnet/live-consumer/{package.json,package-lock.json,verify.mjs}`, `tools/conformance/dotnet/tests/published-consumer.spec.ts`, `tools/conformance/dotnet/README.md`.

- [x] Update the consumer acceptance tests to require 0.8.3 and reject 0.8.2/ranges/local substitutions; verify the new baseline fails before changing validation.
- [x] Update only existing SDK pins and regenerate the registry lock with scripts disabled. Review the complete dependency delta; retain all non-SDK direct pins.
- [x] Run focused tests, build/test/lint for the affected conformance projects and exact recipe compilation. Independently review the change.

### Task 2: Published browser qualification

- [x] Prepare a fresh OS-temp consumer with the repository Nx target. Verify registry SRI, installed versions, real module origins and bundle/source hashes.
- [x] Use task-owned PostgreSQL and the current native fixture to run all 360 unchanged deterministic browser cases against those physical published bundles; zero retries/skips. Preserve results separately from 0.8.2.
- [x] Run the existing bounded 42-case live qualification against the same consumer using the previously authorized root env credential source and Azure CLI. Preserve preflight/native proof ledgers and bounded diagnostics. Defer actual cloud managed identity as requested.

### Task 3: Review and integration

- [x] Record measured results and limitations without credentials or private resource identities. Independently review the final diff/evidence.
- [ ] Create a PR and merge on green, keeping the branch current without blocking other chats. Verify its merged tree and required main checks/deployment as applicable.
- [ ] Remove owned test resources; preserve private evidence and report any blockers honestly.
