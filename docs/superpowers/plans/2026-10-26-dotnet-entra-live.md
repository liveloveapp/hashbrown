# .NET Azure Identity and Live Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Azure CLI/managed identity to the native .NET recipe and qualify Responses with published React/Angular 0.8.2 against real OpenAI/Azure under bounded opt-in execution.

**Architecture:** Preserve the native ProviderFactory and stateless Responses wrapper. Test the actual SDK through credential/transport composition probes, then build allowlisted current scenario sources in an isolated registry consumer and drive a separate six-project live fixture. Production identity, live budgets and artifact redaction are separate small units.

**Tech Stack:** .NET 10, Azure.Core 1.63.0, existing pinned OpenAI/Azure SDKs, Jest/native C# probes, Playwright, standalone Vite/Angular builds, npm 0.8.2 registry packages.

---

Authorization: parent session permits autonomous routine design/review/subagent implementation, live qualification using specified credentials, PR/green merge and verification. Do not ask again for routine decisions. Do not read credentials or call cloud services until the live task. No provisioning or role changes. No new SDK release. Specification: `docs/superpowers/specs/2026-10-26-dotnet-entra-live-design.md`.

## File structure and boundaries

Existing edits: `tools/conformance/dotnet/{Integration/ProviderFactory.cs,Program.cs,Hashbrown.Conformance.csproj,packages.lock.json,project.json,README.md,verify-recipe.mjs,tsconfig.playwright.json}`; both `www/content/docs/{react,angular}/platform/dotnet.md`.

New native tests: `tools/conformance/dotnet/tests/{provider-authentication.spec.ts,provider-authentication-native.spec.ts}` and `tests/fixtures/provider-authentication.cs.txt`. Add a focused `Integration/ProviderAuthentication.cs` only if needed to keep the factory readable. Test-only fake credential/logical HTTPS handler belongs in the C# probe or `Testing/FixtureProviderAuthentication.cs`, never browser configuration.

New isolated consumer: `tools/conformance/dotnet/live-consumer/{package.json,package-lock.json,prepare.mjs,verify.mjs,templates/react-app.tsx,templates/react-main.tsx,templates/angular-app.ts,templates/angular-main.ts}`. Generated configs/output exist only in temp. New Jest coverage `tests/published-consumer.spec.ts`.

New live units: `harness/live-{configuration,budget,diagnostics,fixture,runner}.ts`, `Testing/{FixtureLiveModelClient,FixtureLiveGate}.cs`, `live.playwright.config.ts`, `live-specs/qualification.spec.ts`, `tests/{live-configuration,live-budget,live-diagnostics}.spec.ts`. Keep each file single-purpose; consolidate only genuinely tiny units. Existing `harness/http-fixture.ts` raw cloud-unaware diagnostics must not be reused for live requests. No production SDK package edits.

## Task 1: Native authentication failing tests and dependency lock

- [ ] Read ProviderFactory, ServerConfigurationIdentity, responses-contract.spec.ts, stateless-responses.spec.ts and native fixture helpers. Record baseline exact pins and current test commands.
- [ ] Add top-level Jest cases using the native cs.txt/temporary Probe.csproj pattern. Define configuration table: omitted/api-key retains both APIs; CLI/MI no key; unknown/empty modes fail; OpenAI+token fails; MI selector wrong mode/empty fails; HTTP token endpoint fails before credential construction. Assert credential factory invocation count is zero for rejected configurations.
- [ ] Add system/user MI and CLI dry-construction assertions without network/IMDS. All test sections use arrange/act/assert blank lines.
- [ ] Run `npx nx test dotnet-conformance --testPathPatterns='provider-authentication' --output-style=static`; verify failures specifically indicate missing auth behavior, not restore infrastructure.
- [ ] Add only Azure.Core Version=1.63.0, run `npx nx restore-lock dotnet-conformance`; inspect lock changes. Expected System.ClientModel 1.16 and identity transitives; unrelated direct pins unchanged. Prior isolated native compile passed with zero warnings/errors.
- [ ] Commit tests and explicit dependency change after red-state evidence is captured; never commit secrets/raw credential output.

## Task 2: Minimal factory implementation

- [ ] Add immutable trusted auth parsing and construction. Keep Create(IConfiguration) entry point, introduce minimal test composition overload/options without browser-configurable hooks. Credential selector must run only after provider/API/endpoint/mode validation.
- [ ] Implement default api-key, explicit CLI ProcessTimeout ten seconds, system-assigned MI and FromUserAssignedClientId. Require key only in api-key branch; no fallback/catch-and-retry credential chain.
- [ ] Validate token HTTPS for both APIs in factory. Legacy AzureOpenAIClient 2.1 does not enforce HTTPS itself; do not rely on SDK protection.
- [ ] Use Responses BearerTokenPolicy/ai.azure.com scope and native Azure TokenCredential constructor/cognitive-services audience. Both clients use HttpClientPipelineTransport(HttpClient) for test injection; zero retries, preserved stateless wrapper.
- [ ] Run focused tests then `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, `npx nx lint dotnet-conformance`. Expect no regressions; report all warnings.
- [ ] Commit factory implementation with green evidence.

## Task 3: Real native token/path/renewal/failure coverage

- [ ] Write failing native tests through actual factory-created clients and logical-HTTPS handler that routes beneath SDK policy to loopback. Assert Responses /openai/v1/responses, legacy deployment chat/completions path, exact scopes, bearer and no api-key, keyless success, schema/tool continuation.
- [ ] Add same-client A/B renewal tests. Responses policy requests credential per request even with valid expiry; legacy caches valid tokens, so return already-expired fake tokens to force A then B deterministically without sleeps. Do not claim this proves Azure.Identity cache renewal.
- [ ] Add cancelled credential acquisition => no upstream request; selected credential failure with configured ApiKey => no fallback. Confirm raw sentinel token never reaches diagnostics. Add browser-forwarded mode/scope/identity override attempts.
- [ ] Extend `tests/server-identity.spec.ts` with identical identities across three modes/key rotation and changed identity for API/provider/endpoint/model differences.
- [ ] If feasible, add isolated App Service managed-identity protocol emulator using actual SDK/process-local IDENTITY_ENDPOINT/IDENTITY_HEADER; assert resource/client_id/bearer. Explicitly label emulation, not Azure deployment proof.
- [ ] Run focused auth/native tests, then full dotnet build/test/lint. Keep production TLS validation unchanged; inspect diff for certificate callbacks/insecure flags.
- [ ] Commit green native qualification.

## Task 4: Recipe and documentation

- [ ] Update both framework .NET docs with identical server examples: mode/default, keyless CLI/MI env configuration, trusted scope constants, user-assigned selection, HTTPS/no fallback, existing-account CLI and separate Azure-host MI qualification. Keep browser API unchanged.
- [ ] Update dotnet README with deterministic/native versus opt-in live commands and honest evidence labels.
- [ ] Extend verify-recipe.mjs to compile identity configuration variants without requesting credentials; preserve current four example-block parity and all API/durable/confirmation/recovery variants. Avoid unnecessarily multiplying expensive builds when one configuration compilation proves the shared factory.
- [ ] Run `npx nx check-docs dotnet-conformance`, `npx nx build www`, `npx nx test www`, `npx nx lint www`. Capture failures/warnings and fix introduced issues.
- [ ] Commit tested recipes/docs.

## Task 5: Published consumer with build provenance

- [ ] Add failing Jest checks for exact 0.8.2 package pins, no workspace/file/link/SDK paths, allowed source closure, forbidden unexpected local imports, isolated temp location and rejected provenance escapes/symlinks. Use injected tiny filesystem/build metadata fixtures for fast deterministic failure tests.
- [ ] Check in standalone manifest+lock with compatible pinned React/Angular/build tooling. Copy the exact allowlist from the specification. Main/bootstrap templates preserve fixtureCredential/runUrl validation, StrictMode/zoneless, ordinary HTTP transport. Generate app shells selecting only existing plain/tool/structured/UI components. Do not copy existing main/app or local-transport.
- [ ] Implement prepare.mjs creating fresh temp outside repository ancestry, npm ci from its lock, standalone Vite React and Angular application configs with no root tsconfig inheritance/Nx aliases. Unexpected relative import closure fails before build. Clean temp on failure unless a sanitized artifact retention option is explicit.
- [ ] Implement verify.mjs asserting installed package versions, registry resolved/SRI, module resolution origins from both builders, forbidden repo/dist roots and unexpected symlinks. Save source/template/bundle hashes; SRI and resolution evidence must agree. Never assert filename-only package versions prove runtime origin.
- [ ] Add `prepare-live-consumer` Nx target cache false, no secret requirements; include its TypeScript tools in build checking where appropriate.
- [ ] Run `npx nx test dotnet-conformance --testPathPatterns='published-consumer' --output-style=static`, then `npx nx prepare-live-consumer dotnet-conformance`. Expected both apps built, exact published versions and complete provenance; zero cloud requests. Follow with dotnet build/test/lint and host lint/build if host sources changed.
- [ ] Commit consumer/provenance, no generated node_modules/build output.

## Task 6: Fail-closed opt-in, budgets and redaction before live code

- [ ] Write failing Jest tests for absent opt-in/config, selected credential requirements (CLI no key), unsupported endpoint/mode, counter reservation before dispatch, per-scenario/total/time/token caps, zero retry behavior, and every redaction sink including stdout/stderr/errors/artifacts. Inject sentinel secrets; never use actual credential values.
- [ ] Implement immutable configuration parsing and allowlisted child environment. Credential file may be loaded only at authorized execution, never during imports/build/list-tests. Browser/build process receives no provider credentials; CLI profile location receives minimal OS context without profile inspection/dumping.
- [ ] Link scenario/run deadlines through cancellation tokens to credential acquisition/native enumeration; recheck immediately before dispatch and abort/terminate owned children on deadline. Test in-flight cancellation with a hanging fake credential/transport. Playwright timeout alone does not suffice.
- [ ] Implement shared budget manifest: seven groups/project initial ceilings 1,1,2,2,2,3,3; immutable upfront reservation 14 × 6 plus at most three preflights <=87; <=4/scenario, <=128/run including <=3 preflights, <=384 requested output tokens/call, <=60s/scenario, <=15m/run. Reserve before every continuation/recovery/failure/cancel attempt. Adjust precise ceilings from actual actions before dispatch, never increase safety maxima.
- [ ] Implement allowlisted bounded diagnostics, aggregate <=2MiB, sanitization before persistence. Disable live traces/raw body capture. Never emit native credential exception messages without filtering; ordinary cloud response bodies are not diagnostic defaults.
- [ ] Run focused unit tests, dotnet build/test/lint. Inspect all persistence sinks and prove canary absence. Commit safety prerequisites before live execution.

## Task 7: Live fixture, six projects and seven scenario groups

- [ ] Write failing fixture unit tests proving selected metadata, manifest accounting and dispatch-time budget enforcement. Add C# test-only live budget/gate wrappers and safe statistics, opt-in only.
- [ ] Compose native client gate innermost before HashbrownRequestClient, observing real text update then pausing subsequent enumeration. Preserve all native update/evidence content. Cancellation must cancel real iterator and set safe cancelled stats, no synthetic SSE.
- [ ] Build isolated live fixture using actual Program/agent/checkpoint controls and redacted child output. Confirm-after checkpoints enable pending/reload/decline without native dispatch; reload/refresh Pending restores original request ownership, explicit approval completes through the real model exactly once, then reload/refresh Completed performs no additional model/effect work; fresh-thread decline uses zero model/effect work. Use new thread/fixture for post-cancel success when necessary.
- [ ] Create six explicit Responses projects (framework × OpenAI-key/Azure-key/Azure-CLI), one worker, zero retries, timeout60s and global15m. Use isolated consumer servers and existing createAppDriver. Implement seven top-level scenario groups, assertion contracts from specification; force named tools via trusted controls where supported, no exact prose checks.
- [ ] Add live-provider-e2e cache:false target with no default dependency. Runner builds/proves consumer, validates opt-in, starts selected projects, fails any unavailable selected credential instead of silently skipping. Add independent native Azure CLI Chat Completions audience preflight. Keep cloud managed identity separately invokable on existing Azure host.
- [ ] Run list-tests without credentials and verify it dispatches nothing. Run deterministic tests/build/lint and `npx nx provider-e2e dotnet-conformance` (existing deterministic suite). Expected original suite remains green.
- [ ] Commit live harness before accessing authorized env file.

## Task 8: Authorized execution, evidence, review and integration

- [ ] Confirm Responses PR #770 merged baseline and rebase follow-up if needed; preserve unrelated changes. Root handles git integration. Run preparation/provenance and inspect only sanitized report.
- [ ] Load authorized credential file through runner allowlist without printing values. Run bounded native OpenAI/Azure Responses and Azure CLI legacy preflights; fail closed on missing/mis-scoped identity rather than falling back. Do not modify account/resource configuration to make them pass.
- [ ] Run `npx nx live-provider-e2e dotnet-conformance` with explicit live opt-in supplied through environment (runner documents exact variable names when implemented). One report must contain all six projects × seven groups, source/bundle provenance, request counts/usage and redacted failures. No live retry on failure; fixes require separately recorded run/budget.
- [ ] Run final `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, `npx nx lint dotnet-conformance`, `npx nx check-docs dotnet-conformance`, `npx nx provider-e2e dotnet-conformance`; run www build/test/lint for edited docs and any affected consumer/host commands. Review exact lock/pin changes and no SDK package diffs.
- [ ] Request spec/plan and implementation reviews per skills; fix actionable issues, reverify affected checks. Reviewers must check provenance, fail-closed auth, TLS, same-client renewal, cancellation, call budgets and secret sinks.
- [ ] Open follow-up PR with concrete behavior/validation and distinction between CLI live, MI emulation and any actual Azure-host result. Attach PR in app. Wait required CI, merge only green, verify merged main revision/checks. No npm release.
- [ ] Final report includes links, merged revision, all tests/warnings, real matrix result and precise managed-identity qualification limit. If no authorized Azure host exists, state cloud MI remains unqualified; do not provision one.

Design review: independent reviewer approved after clarifying real reload/refresh recovery assertions, upfront immutable budget reservations and linked in-flight deadline cancellation. Isolated native probe compiled with zero warnings/errors; implementation review must recheck split stdout/stderr redaction and both bundle origin proofs.
