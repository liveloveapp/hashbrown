# .NET Recovery And Operations Hardening Plan

> **For agentic workers:** Use subagent-driven-development with independent spec and quality review. The maintainer approved items 1–3 and C# highlighting; continue within that scope without a new permission round. Release safeguards and NuGet packaging are excluded.

**Goal:** Make cold structured/UI recovery useful without inventing cancellation ownership, physically enforce PostgreSQL retention without new admissions, diagnose the isolated recovery timeout, and highlight the .NET docs correctly.

**Architecture:** Keep native AG-UI history canonical and default schema/provenance validation strict. Use the independently reviewed explicit historical-diagnostics policy; do not invent cancellation ownership or add a receipt channel. Add bounded independent PostgreSQL maintenance using row-lock-safe retention predicates. Collect bounded timing evidence without warming model paths, changing deadlines or adding retries. Load bundled Shiki C#/XML grammars.

**Tech Stack:** Existing core/React/Angular runtime, ASP.NET Core/Npgsql reference helpers, PostgreSQL 18, Nx/Jest/Vitest/Playwright/aimock, existing Shiki.

## Task 1: C# And XML Highlighting

Files: `www/src/lib/rehype-shiki.ts`, `www/test/rehype-shiki.spec.ts`.

- [ ] Add failing fenced-code tests for csharp, cs, c# and xml using representative .NET source; verify canonical language markers and multiple syntax-token colors. Cover direct highlightCode aliases too; preserve unknown-language fallback and escaping.
- [ ] Run focused `npx nx test www --excludeTaskDependencies --skip-nx-cache -- www/test/rehype-shiki.spec.ts` and record failure before changing implementation.
- [ ] Add existing bundled csharp/xml grammars and C# aliases without dependencies or unrelated theme changes.
- [ ] Rerun focused tests; later run complete www build/test/lint and inspect rendered .NET route highlighting.

## Task 2: Cold Recovery

- [x] Complete independent design review: serialized native history cannot prove original local cancellation ownership. Never infer ownership from marker text, IDs or private metadata.
- [ ] Review the selected API/trust-boundary design in `docs/superpowers/specs/2026-10-25-dotnet-cold-recovery-hardening-design.md`.
- [ ] Add public restore options/diagnostic DTOs, optional diagnostics on recovery state and facade forwarding; tests first. Keep exclusions bound to exact owned canonical sources across all projection paths. Default strict and all non-assistant-history validations remain unchanged.
- [ ] Opt .NET reference hosts into explicit diagnostics, render escaped diagnostic text, and add cold structured/UI browser cases. Update both guides with accurate unreleased-SDK notice.
- [ ] Write core/facade failing tests, implement, and exercise cold reload against real .NET hosting across React/Angular and OpenAI/Azure. Restoration remains inert and raw model history remains exact.

## Task 3: PostgreSQL Retention And Production Guidance

Files: `tools/conformance/dotnet/Integration/PostgresInterruptStore*`, existing retention/contracts/test fixtures, both .NET platform guides and internal README.

- [ ] Review bounded independently committed cleanup API and concurrency predicates before implementation.
- [ ] Write failing tests for idle cleanup, full-capacity admission failure, independent snapshot/audit deadlines, bounded repeated passes, unresolved effect preservation and concurrent worker transitions.
- [ ] Implement concrete maintenance entry point and tested recipe scheduling example without new dependencies, changing lease semantics or automatically retrying external effects.
- [ ] Document lease sizing, readiness, privacy-preserving bounded metrics/logs, operator reconciliation, shared database/auth/registry versions, proxy buffering/timeouts, draining and durability guarantees. Compile exact C# snippets via existing recipe verifier.

## Task 4: Recovery Timeout Evidence

Files: `tools/conformance/dotnet/harness/{http-fixture,routed-endpoint,durable-fixture}.ts`, appropriate fixture tests and recovery-lifecycle browser specs.

- [ ] Preserve original five-second assertion, effect/model counts and retries=0. No synthetic warm-up work.
- [ ] Write failing tests for bounded monotonic correlated timeline events at request/upstream-header/first-byte/end/error/cancel boundaries; no additional captured private bodies.
- [ ] Attach useful timelines to failed browser cases; use repeated original worker-restart cases to gather evidence before proposing any timing behavior change. Record whether a concrete cause is demonstrated or only observability improved.

## Integration

- [ ] Run build/test/lint for all affected packages, generated API checks where appropriate, exact .NET recipe compilation and full browser matrix. Serialize Nx graphs per workspace and retain diagnostics.
- [ ] Obtain independent spec review then code-quality review, resolve findings, create/attach PR, merge only on required green checks, and verify main/production/live C# highlighting. Do not publish another SDK release without a request.
