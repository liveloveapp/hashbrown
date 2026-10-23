# .NET AG-UI integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Inline execution is appropriate for the initial feasibility work; do not parallelize files or infrastructure with shared process state.

**Goal:** Document and continuously test a real .NET AG-UI integration for React and Angular with OpenAI and Azure OpenAI, structured/UI output, browser/server tools, and application-owned interrupt/resume.

**Architecture:** Use Microsoft Agent Framework hosting and the upstream .NET AG-UI SDK. A small reference layer configures request-local schemas and explicit application interruption gates. Test the actual ASP.NET process and native provider clients against strict aimock fixtures, capturing native model requests before normalization.

**Tech Stack:** .NET 10 / ASP.NET Core, Microsoft Agent Framework, AGUI.Server, Microsoft.Extensions.AI.OpenAI, OpenAI and Azure.AI.OpenAI SDKs, existing aimock 1.46.0, Jest, Playwright, and Nx.

**Approved specification:** [Design](../specs/2026-10-23-dotnet-agui-integration-design.md). The user approved its scope on October 23, 2026. This plan does not authorize adding unapproved dependencies.

## Preconditions and dependency approval

Do not write package references or restore new NuGet dependencies until the user approves the concrete additions below. Reading manifests for planning is complete. No npm dependency is proposed. Toolchain installation occurs when execution begins; the dependency approval gate concerns the project package additions.

| Direct reference | Exact version | Purpose |
| --- | --- | --- |
| Microsoft.Agents.AI.Hosting.AGUI.AspNetCore | 1.26.0-preview.261023.1 | Real ASP.NET AG-UI hosting |
| Microsoft.Agents.AI | 1.26.0 | Agent and registered server tools |
| AGUI.Abstractions | 1.0.1 | Protocol models and native interrupt serialization |
| AGUI.Server | 1.0.1 | Upstream input/event translation, including protocol version |
| Microsoft.Extensions.AI.OpenAI | 10.10.1 | Adapt genuine provider clients to IChatClient |
| OpenAI | 2.14.0 | OpenAI client used directly by the provider factory |
| Azure.AI.OpenAI | 2.1.0 | Azure endpoint/deployment/API-key behavior |

Pin SDK `10.0.402` in a project-local `global.json` with `rollForward: disable` and `allowPrerelease: false`. Microsoft release metadata identifies it as the October 13, 2026 SDK. The seven NuGet archives were available and their manifests inspected on October 23. Availability is not runtime validation. AG-UI 1.0.1 raises the hosting package's 1.0.0 minimum; OpenAI 2.14.0 satisfies both the MEAI client's 2.14.0 minimum and Azure's 2.1.0 minimum. Runtime/binary compatibility remains a required feasibility check. Commit the complete resolved transitive graph in `packages.lock.json` after approved restore; do not suppress downgrade/audit warnings.

Sources: [Microsoft SDK release metadata](https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json), [NuGet manifests](https://api.nuget.org/v3/index.json), [pinned SDK source findings](../research/2026-10-23-non-node-providers-and-dotnet-agui.md).

The initial .NET SDK and `node_modules` are absent from the working environment. Install the approved SDK in task-owned temporary storage if needed, with its CLI/cache environment scoped to this task; do not change shell profiles or a global SDK. Use the existing npm lockfile with `npm ci` when execution begins. Never use an implicit `npx` download as a substitute for installing the locked workspace dependencies.

## File map

All paths below are repository-relative. The `.NET` project root is `tools/conformance/dotnet`, distinct from the parent `conformance` project.

| File or group | Responsibility |
| --- | --- |
| `tools/conformance/dotnet/project.json` | Nx build/test/lint/provider-e2e targets and affected graph |
| `tools/conformance/dotnet/global.json` | Exact SDK selection when commands run from the .NET root |
| `tools/conformance/dotnet/nuget.config` | Public NuGet source, no custom feeds |
| `tools/conformance/dotnet/.editorconfig` | C# formatting conventions for format verification |
| `tools/conformance/dotnet/.gitignore` | Exclude generated `bin/` and `obj/` directories |
| `tools/conformance/dotnet/Hashbrown.Conformance.csproj` | net10.0 web executable, exact references, locked restore |
| `tools/conformance/dotnet/packages.lock.json` | Resolved dependency graph |
| `tools/conformance/dotnet/Program.cs` | Compose upstream host and reference integration; no workflow logic |
| `tools/conformance/dotnet/Integration/ProviderConfiguration.cs` | Immutable provider configuration and validation |
| `tools/conformance/dotnet/Integration/ProviderFactory.cs` | OpenAI and Azure native clients |
| `tools/conformance/dotnet/Integration/HashbrownRequestClient.cs` | Request-local schema translation and tool-collision checks |
| `tools/conformance/dotnet/Integration/InterruptWorkflowClient.cs` | Native generic interrupt gate and validated continuation |
| `tools/conformance/dotnet/Integration/PendingInterruptStore.cs` | Atomic process-local checkpoint lifecycle |
| `tools/conformance/dotnet/Integration/PendingInterrupt.cs` | Immutable checkpoint/decision records |
| `tools/conformance/dotnet/Integration/HashbrownEndpointConfiguration.cs` | Upstream serializer, hosting registration, pre-stream validation |
| `tools/conformance/dotnet/Testing/FixtureTools.cs` | Test-only server tools and execution evidence |
| `tools/conformance/dotnet/Testing/TestControls.cs` | Loopback-only, test-isolated counters, workflow setup, clock, and gates |
| `tools/conformance/dotnet/README.md` | Internal fixture commands and diagnostics, not the user recipe |
| `tools/conformance/dotnet/jest.config.ts` and `tsconfig.spec.json` | HTTP suite selection and typechecking |
| `tools/conformance/dotnet/tests/*.spec.ts` | Native request, schema, tools, resume, concurrency, and lifecycle checks |
| `tools/conformance/dotnet/dotnet.playwright.config.ts` | Four framework/provider projects and two browser hosts |
| `tools/conformance/dotnet/specs/*.spec.ts` | Browser scenarios, selected separately from Jest |
| `tools/conformance/dotnet/harness/model-proxy.ts` | Original model HTTP evidence, stream/fault gates, transparent forwarding |
| `tools/conformance/dotnet/harness/dotnet-host.ts` | Process lifecycle, readiness, exit handling, diagnostics |
| `tools/conformance/dotnet/harness/model-fixtures.ts` | Strict aimock scenarios; no AG-UI endpoint mocking |
| `tools/conformance/dotnet/harness/http-fixture.ts` and `browser-fixture.ts` | Shared per-test process/aimock ownership without test API coupling |
| Existing React/Angular `interrupt-controls` and `plain-smoke` files | Public resume decisions and server-tool observations needed by browser tests |
| `tools/conformance/tsconfig.playwright.json`, `tsconfig.spec.json`, `project.json` | Explicit typecheck/lint selection for new TypeScript files |
| `.github/workflows/pr-main.yml` | Conditional SDK installation before generic checks, explicit e2e invocation, artifacts |
| React/Angular `platform/dotnet.md`, `platform/custom.md`, `start/platforms.md` | Tested application recipe and entry-point links |
| `www/src/components/menus/docs-menu.data.ts` | .NET recipe navigation |

Keep new TypeScript harness code inside the new project root so its ownership is clear. Import existing `app-driver`, event gate, and browser hygiene helpers from the parent conformance project. The new project depends on `conformance`; do not introduce a reverse dependency or have parent Jest discover child Playwright specs.

## Working rules

- Follow @superpowers:test-driven-development and @superpowers:verification-before-completion during execution. Write top-level `test(...)` with arrange/act/assert; no suite hooks in added tests. Wrap owned test resources with a helper that invokes the test body and tears down in `finally`.
- Add TSDoc to reusable TypeScript helpers and XML documentation to reusable C# reference helpers. Avoid new public core/React/Angular APIs.
- Every behavioral task follows red/green: write a real failing assertion, run its focused Nx command, make the smallest change, rerun, and commit. An absent toolchain or compile error alone is not the behavioral red test.
- Keep commits focused and include neither assistant/product attribution nor unrelated changes. Check `git diff --check` before each commit.
- Do not claim support by skipping missing .NET/Azure cases. Any required capability that needs a fork, Node proxy adapter, or changed support boundary goes back to design review.

## Task 1: Bootstrap approved dependencies and validate real hosting feasibility

**Files:** create `project.json`, `global.json`, `nuget.config`, `.editorconfig`, `Hashbrown.Conformance.csproj`, `packages.lock.json`, `Program.cs`, `Integration/ProviderConfiguration.cs`, `Integration/ProviderFactory.cs`, `Integration/HashbrownEndpointConfiguration.cs`, `Testing/TestControls.cs`, Jest/TypeScript configs, `tests/feasibility.spec.ts`, and minimal `harness/dotnet-host.ts`, `http-fixture.ts`, `model-fixtures.ts` under the new root.

- [ ] Record user approval for the seven exact NuGet references. If not approved, stop before package additions, with the plan ready for review.
- [ ] Install the specified toolchain if missing. Add the exact SDK pin and net10.0 web project with `RestorePackagesWithLockFile=true`. Provide a local, uncached Nx `restore-lock` target running `dotnet restore --use-lock-file` from the .NET root for initial lock generation and deliberate dependency updates; run `npx nx restore-lock dotnet-conformance` and review the generated lockfile. Do not have normal CI invoke this updating target. Subsequent normal builds use locked restore.
- [ ] Give `dotnet-conformance:build` a command run from `tools/conformance/dotnet`: `dotnet restore --locked-mode` followed by `dotnet build --no-restore -c Release -o ../../../dist/tools/conformance/dotnet`. Declare Nx output `{workspaceRoot}/dist/tools/conformance/dotnet` if enabling build caching, and keep the launcher pointed at that directory. Keep normal MSBuild intermediates under `obj/`; output the runnable DLL to that dist path. Ignore `bin/`, `obj/`, and other generated files locally.
- [ ] Add `dotnet-conformance:test` using the existing `@nx/jest:jest` executor, a child Jest configuration, `testMatch: ['<rootDir>/tests/**/*.spec.ts']`, `runInBand`, a generous bounded startup timeout, and `dependsOn: ['build']`. Reuse the parent transform convention with the child's TS config. No new npm/C# test runner.
- [ ] Implement bounded process readiness at `/health` and deterministic teardown; the host may initially answer `/run` with a clear 501. Start aimock strictly with one text fixture. Write feasibility tests that parse the actual SSE with pinned `EventSchemas` and require a model request, matching run IDs, protocol version, and final text. Run `npx nx test dotnet-conformance --testPathPatterns=feasibility`; expect behavioral failure on the 501.
- [ ] Compose the genuine clients and `AddAGUIServer`/`MapAGUIServer` using a fresh conversation per request. Use OpenAI model `fixture-openai-model` and Azure deployment `fixture-azure-deployment`, configured separately from the public model name. Supply fixture credentials and a localhost endpoint. Disable SDK retries for normal conformance cases. Configure explicit CORS for fixture browser origins on ports 4431/4432, including OPTIONS and required run headers, because the browser and .NET host use different origins. Add a preflight assertion; production docs prefer same-origin hosting or an application-owned allowed-origin policy.
- [ ] Make the text test pass for each provider. Assert OpenAI and Azure's distinct native URL/auth/deployment evidence using a minimal HTTP byte observer, consolidated into the reusable proxy in Task 2; keep the Azure endpoint shape sent by the real SDK, including `api-version` when emitted. Probe native `InterruptRequestContent` serialization through the real upstream converter, exact schema options reaching the native request, two-turn history without duplication, and generic interruption with browser tools registered. These additional assertions may remain red until Tasks 3/6, but establish their actual upstream extension points here.
- [ ] Record the concrete middleware/endpoint filter APIs and the source of pending input context in the feasibility test notes. If native interrupt polymorphism fails, add only the upstream `RegisterInterruptContentTypes` configuration and rerun. If the approved composition is not feasible without a protocol fork, stop and bring the evidence to the user.
- [ ] Run `npx nx build dotnet-conformance`, the text feasibility tests, and `npx nx lint dotnet-conformance`. Add `lint` as `dotnet format --verify-no-changes --no-restore` from the pinned SDK directory. Commit bootstrap and passing text checks only; do not commit failing probes as normal test cases. Keep later requirements in explicit tests as their implementation tasks begin.

No tool-specific request DTO or custom SSE encoder is introduced. A schema bridge test must inspect a real provider request, not a delegating-client invocation mocked in isolation.

## Task 2: Capture original model requests and prove process cleanup

**Files:** create `harness/model-proxy.ts`, `tests/model-proxy.spec.ts`, `tests/dotnet-host.spec.ts`; expand `harness/dotnet-host.ts`, `http-fixture.ts`, and `model-fixtures.ts`.

- [ ] Write tests for original body/path/query capture, repeated identical deltas, response streaming before EOF, native errors, request cancellation, and cleanup after assertion/startup failure. Run `npx nx test dotnet-conformance --testPathPatterns='model-proxy|dotnet-host'`; observe the missing behavior.
- [ ] Implement an ephemeral loopback Node HTTP proxy using existing built-ins. Capture body bytes before forwarding, cap retained diagnostic bodies, redact authentication values, and expose only fixture authentication type/presence. Forward status, headers, SSE bytes, and abort. Preserve request bytes/path/query to aimock; do not convert Azure requests into the OpenAI route.
- [ ] Start aimock with strict replay and existing `startAimock`. Give each HTTP/browser test an isolated fixture instance. If aimock needs to match an Azure deployment route, use its supported Azure handler, verifying the genuine path in the capture boundary; do not relabel an OpenAI request.
- [ ] Make the process launcher run the built DLL with the task SDK host, `ASPNETCORE_URLS=http://127.0.0.1:0`, a bounded readiness probe, and a reliably discovered assigned address. Capture bounded stdout/stderr, reject early exits, and terminate the owned process tree on cleanup. A `stop()` call is idempotent. Release gates before graceful shutdown, with a forced termination deadline.
- [ ] Add a transparent optional AG-UI byte observer for protocol diagnostics without delaying or reserializing events. Restrict lifecycle-close allowances to the matching terminal run using the existing browser hygiene pattern.
- [ ] Rerun focused tests and `npx nx build dotnet-conformance` / `npx nx lint dotnet-conformance`. Commit harness behavior independently.

The harness body signature is a simple owned scope usable from either test API:

```ts
/** Owns isolated model fixtures and a real .NET host for one test body. */
export async function withDotnetFixture<T>(
  options: DotnetFixtureOptions,
  use: (fixture: DotnetFixture) => Promise<T>,
): Promise<T>;
```

The eventual implementation defines `DotnetFixtureOptions` and `DotnetFixture` in `http-fixture.ts`, including provider, captured requests, endpoint URL, test controls, and async shutdown. This is a planned interface, not existing code.

## Task 3: Configure schemas without mutating shared options

**Files:** create `Integration/HashbrownRequestClient.cs`, `tests/request-contract.spec.ts`; expand `Integration/HashbrownEndpointConfiguration.cs` and the native capture fixtures.

- [ ] Write two-provider HTTP tests: ordinary text omits response format; structured mode sends the exact schema; UI sends its actual component schema; a second request with no schema does not inherit the first request's format. Assert tools/additional properties survive the request configuration.
- [ ] Add invalid-schema and browser/server tool-name-collision cases. Both must return a pre-stream 4xx with zero native model requests and zero execution counters. Run `npx nx test dotnet-conformance --testPathPatterns=request-contract`; record the relevant failures.
- [ ] Implement the request-local `DelegatingChatClient` configuration using `ChatOptions.TryGetRunAgentInput`, `RunAgentInput.ForwardedProperties`, and `ChatResponseFormat.ForJsonSchema`. Clone options before changing `ResponseFormat`; preserve tools and additional properties. Read schema only at `hashbrown.responseSchema`, preserve the `ui` marker, and do not set a schema for ordinary chat.
- [ ] Perform pre-stream shape/collision checks in the upstream-supported endpoint filter/application wrapper established in Task 1. Validate schema-object shape without inventing an incomplete general JSON Schema validator. Let provider unsupported-schema failures remain explicit; do not silently fall back to prose.
- [ ] Assert the actual `response_format` native wire for both genuine clients, not normalized aimock journal content. Rerun request tests and build/lint. Commit semantic translation.

Reference structured schema for one focused HTTP case:

```ts
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'count'],
  properties: {
    answer: { type: 'string' },
    count: { type: 'number' },
  },
};

// Arrange the real fixture and response in the test's owned resource scope.
// Act by posting RunAgentInput with forwardedProps.hashbrown.responseSchema.
// Assert against captured original native JSON, including this exact schema.
```

## Task 4: Establish browser, server, and mixed tool ownership

**Files:** create `Testing/FixtureTools.cs`, `tests/tools.spec.ts`; expand `Program.cs`, `Testing/TestControls.cs`, and `harness/model-fixtures.ts`.

- [ ] Add deterministic native tool fixtures for a browser `getWeather`, server `lookupAirport`, repeated `getWeather` with different call IDs/results, and both mixed sequential orders. Use counters/results observable through test-only controls.
- [ ] Write failing HTTP tests that submit genuine browser result messages and require model continuation to receive matching call/result IDs exactly once. Run `npx nx test dotnet-conformance --testPathPatterns=tools`.
- [ ] Register the server function with the upstream agent using its native tool API. Forward browser declarations through upstream AG-UI translation. Do not implement a second agent loop. Keep configuration immutable across requests and reject tool name collisions.
- [ ] Pass server-only, client-only, both mixed orders, and repeated calls. Verify the server result is emitted before the terminal and a later run does not replay its effect. Check original native requests for exact history and tool declarations.
- [ ] Add a single-model-response simultaneous client/server-call case. Establish one deterministic supported policy: complete with correct ownership if upstream handles it; otherwise reject that response before application tool effects with a clear unsupported-combination error. Document the observed policy, and test it in all four browser/provider combinations later. Never let Hashbrown attempt a server-only function as a browser tool.
- [ ] Run focused tests, build/lint, and commit tool integration. If upstream cannot preserve sequential mixed ownership, return to design review; it is required scope.

## Task 5: Implement a bounded atomic pending interrupt store

**Files:** create `Integration/PendingInterrupt.cs`, `Integration/PendingInterruptStore.cs`, `tests/pending-interrupts.spec.ts`; expand `Testing/TestControls.cs` only for isolated fixture setup/clock control.

- [ ] Add HTTP-boundary store tests through loopback-only test controls: complete batch, duplicate/missing IDs, unknown/expired records, principal/thread mismatch, bounded capacity, duplicate consumption, and concurrent claims. Run `npx nx test dotnet-conformance --testPathPatterns=pending-interrupts`; expect missing-store behavior failures.
- [ ] Implement immutable pending data: principal scope, thread ID, origin run, interrupt entries/schema descriptors, server-owned workflow action arguments, absolute expiry, and state. Use `TimeProvider` for deterministic expiration; fixture controls advance the test clock, never production routes.
- [ ] Implement all-or-nothing validation and an atomic transition from pending to in-progress. Preserve an in-progress/consumed record to expiry after execution begins; never release it automatically on an ambiguous failure. Capacity exhaustion rejects new checkpoints rather than evicting active work. Cleanup expired records opportunistically or through the store's bounded maintenance path.
- [ ] Use an internal lock or atomic map operation for coordination, but never mutate caller-owned decision/checkpoint objects. Keep server effects outside the critical section. An execution lease has explicit safe-before-effect release and consumed/uncertain completion; do not claim exactly-once execution of external systems.
- [ ] Prove the claim race by starting two concurrent real HTTP submissions with a shared gate: one claim advances, the other returns conflict, protected counter remains one. No sleeps. Rerun focused tests, build/lint, and commit.

Planned state transitions:

```text
pending -> in-progress -> consumed
pending -> declined/cancelled (consumed)
pending -> expired
in-progress -> pending only when explicitly proven no effect began
in-progress -> consumed/uncertain after effect, error, or ambiguous disconnect
```

Consumed/uncertain records reject automatic resubmission. A later human/application recovery process is outside this integration.

## Task 6: Compose native interrupts and validated resume with real tools

**Files:** create `Integration/InterruptWorkflowClient.cs`, `tests/interrupt-resume.spec.ts`; expand `Integration/HashbrownEndpointConfiguration.cs`, `Testing/FixtureTools.cs`, and test fixtures.

- [ ] Add a native input-gate test which requests confirmation before a server step and emits `InterruptRequestContent` through the real upstream stream converter. Require a browser-facing `RUN_FINISHED` interrupt outcome with two entries and response schemas, after the pending record is stored. Run `npx nx test dotnet-conformance --testPathPatterns=interrupt-resume`; expect no gate/resume support.
- [ ] Implement the explicit application gate as a small delegating model client/workflow middleware using the supported extension points from Task 1. Use server-configured fixture workflow rules, not model-trusted authorization and not custom SSE. Preserve original AG-UI input for status validation. Keep fixture scenario selection out of the documented production API.
- [ ] On resume, validate the full batch against the pending store before further agent/model/tool work. Inspect each original `resume.status`. Accepted inputs continue from server-owned checkpoint data; `{approved:false}` declines; `cancelled` abandons. Return pre-stream 4xx on invalid/expired/consumed input with no native requests or effects.
- [ ] Continue accepted work through the registered native server tool and real model client. Do not manufacture a tool result in a test control. Pass cancellation through model/tool calls and store lifecycle transitions.
- [ ] Add a browser-tool round followed by an interrupt and a protected server step. Assert prior browser/server results are retained once in history and effects do not replay. A confirmation while browser tools are registered must still interrupt; automatic MAF tool approvals must not be substituted for this generic application gate.
- [ ] Cover accepted batches, one declined entry, one cancelled entry, expiration, forged protected action parameters in the submitted transcript, concurrent/double resume, and disconnect after protected work begins. Rerun focused tests and build/lint; commit the interruption workflow.

Use this standard wire answer shape (the local browser `batchId` stays off the wire):

```json
{
  "threadId": "same-thread",
  "runId": "new-run",
  "messages": [],
  "resume": [
    { "interruptId": "confirm-action", "status": "resolved", "payload": { "approved": true } },
    { "interruptId": "confirm-context", "status": "resolved", "payload": { "approved": true } }
  ]
}
```

Real requests include the complete committed transcript. The empty messages above illustrate the envelope only; tests must not discard conversation history when resuming.

## Task 7: Wire the four-way browser matrix and public controls

**Files:** create `dotnet.playwright.config.ts`, `harness/browser-fixture.ts`, `specs/text.spec.ts`; modify `tools/conformance/hosts/react/src/interrupt-controls.tsx`, `plain-smoke.tsx`, Angular `src/app/interrupt-controls.ts`, `plain-smoke.ts`, and conformance TypeScript/project configs.

- [ ] Configure four Playwright projects with metadata `{provider:'openai'|'azure'}` and framework base URLs on dedicated ports 4431/4432. Both projects for a framework share its built host; the per-test fixture owns .NET/aimock. Use existing app driver/hygiene helpers, `workers: 1`, bounded timeouts, zero retries, retained failure traces, and a dedicated report directory.
- [ ] Add `dotnet-conformance:provider-e2e`, uncached, with explicit build dependencies on the .NET project and both browser hosts. Each browser test gets its `runUrl` from the fixture; the browser consumes the actual .NET SSE response.
- [ ] Write failing UI tests for decline and cancellation controls through public `resume()`, preserving the existing Resume/approved behavior. Add minimal buttons and test IDs to both hosts; use Angular signals/function APIs and pure React render behavior. Display server-tool observations only where required by the assertion.
- [ ] Pass the existing interrupt conformance suite after the host-control changes. Add native text tests requiring a visible partial answer while the model gate is held, then release and assert clean idle state. Include the two-turn history check for each provider.
- [ ] Add child Playwright files and harness to `tools/conformance/tsconfig.playwright.json`, HTTP/Jest files to the child test config, and exclude Playwright files from Jest. Add child config/harness/test typechecks to the parent conformance build, without making the parent project build .NET. Ensure parent lint sees the new TypeScript files.
- [ ] Run `npx nx build conformance`, `npx nx lint conformance`, `npx nx test conformance`, `npx nx provider-e2e dotnet-conformance --grep='text|history'`; commit matrix/control changes. Full host/package verification remains in Task 12.

## Task 8: Prove structured output and trusted UI in the browser

**Files:** create `specs/output.spec.ts`; expand `harness/model-fixtures.ts`, `harness/browser-fixture.ts`; reuse the current structured/UI browser hosts and app driver.

- [ ] Write top-level generated tests for structured partial/final output and trusted UI partial/final props. Capture the actual client-supplied schema from `/run` and require exact translation to native `response_format`. Run `npx nx provider-e2e dotnet-conformance --grep='structured|trusted UI'` and record the genuine gap.
- [ ] Use strict aimock JSON fixtures and gate a response after a valid partial JSON prefix. Assert a partial value or component prop before releasing the rest. Keep native text content unmodified through the .NET event adapter.
- [ ] Verify the trusted component renders, a real browser action works, and unexposed component names/invalid props cannot become trusted UI. Test malformed JSON/schema-violating model output produces Hashbrown's existing errors; do not add a new parser.
- [ ] Require native schema evidence and zero unexpected native calls in every project, including Azure deployment/auth/path assertions inherited from the fixture. Rerun focused browser tests and relevant typechecks/lint; commit.

## Task 9: Prove tools and interrupt/resume through both public framework APIs

**Files:** create `specs/tools.spec.ts`, `specs/interrupt-resume.spec.ts`; expand native fixtures and browser helper assertions.

- [ ] Write browser tests for client/server-only tools, both mixed sequential orders, repeated browser tool calls, and the deterministic simultaneous-call policy established in Task 4. Gate model continuation while asserting counters/tool-result evidence. Run the focused native browser suite and observe missing behavior before fixes.
- [ ] Exercise the real framework `pendingInterrupts`, `isResuming`, and `resume` APIs: accepted batch, decline, cancel, invalid batch rejection, and expiration. Use server-expiry tests and application clock controls for authoritative expiry; do not wait for a wall-clock TTL.
- [ ] Exercise client tool then interrupt then server tool, including one earlier completed server effect. Assert zero protected effects before acceptance and exactly one after, unchanged prior effect counts, stable thread/new run IDs, and exact native history. Pending batch remains visible and controls disabled while accepted resume is held in flight.
- [ ] Attempt at least one direct duplicate HTTP resume associated with the browser workflow; require rejection and unchanged counters. Keep the store-race matrix in Jest rather than duplicating every negative case in Playwright.
- [ ] Confirm public `batchId` never reaches the server as a storage key. Use narrow browser hygiene allowances for intentional 4xx/disconnect cases. Rerun the four-way focused suite and commit.

## Task 10: Prove native errors, cancellation, and wire fidelity

**Files:** create `specs/errors-and-cancellation.spec.ts`, `tests/wire.spec.ts`; expand model-proxy fault/gate helpers without changing application SSE encoding.

- [ ] Write tests for pre-stream invalid input, upstream HTTP error, post-header native-model failure mapped through MAF, truncated AG-UI transport, and browser Stop before model completion. Run focused Nx tests/e2e and observe the missing safeguards.
- [ ] Route provider-native failures through the real SDK/MAF path. For a truncated AG-UI stream, use a test-only byte-transparent proxy to close the transport after a known actual event; never mock the entire event sequence. Record the distinction between a transport fault and a producer `RUN_ERROR`.
- [ ] Observe the upstream connection closing and server tool cancellation token. Gate a protected step and cancel before it begins, then verify zero effects; disconnect after a side effect has begun must retain conservative checkpoint consumption and prevent replay.
- [ ] Parse every captured actual event with `EventSchemas` from `@ag-ui/core/schemas`, requiring matching IDs, one started event, protocol version, omission rules, correct ordering, and one terminal on normally completed runs. Cancellation permits transport closure without a terminal. Preserve repeated identical text chunks.
- [ ] Assert rollback/clean idle behavior and no late UI updates/effects. Rerun focused suites, then the full `npx nx provider-e2e dotnet-conformance` and HTTP tests. Commit lifecycle coverage/fixes.

## Task 11: Wire CI affected selection and publish the tested recipes

**Files:** modify `.github/workflows/pr-main.yml`, new `project.json`, parent TypeScript config/project files; create `www/content/docs/react/platform/dotnet.md`, `www/content/docs/angular/platform/dotnet.md`, and fixture `README.md`; modify both `platform/custom.md`, `start/platforms.md`, `www/src/components/menus/docs-menu.data.ts`, and `www/test/menus/docs-menu.spec.tsx` if navigation assertions need updating.

- [ ] Add a failing selection/typecheck check showing that new harness/browser files and affected core/framework changes include the child project. Define explicit dependencies on core, React, Angular, testing, conformance, and both runtime hosts. Do not add the existing Node openai/azure packages as semantic prerequisites for native .NET clients.
- [ ] Set affected inputs for project-local SDK/lockfiles and CI workflow. Do not assume cache `inputs` alone mark a project affected: verify with `npx nx show projects --affected --files=tools/conformance/dotnet/global.json --json`, then representative core/framework files and `.github/workflows/pr-main.yml`. Use an appropriate root input/implicit dependency or explicit CI workflow-change override if needed.
- [ ] Before the generic affected build/test/lint step, compute whether `dotnet-conformance` is selected and conditionally install SDK 10.0.402 with the supported setup-dotnet action (verify/pin its release per current repository action conventions). Add a later explicit invocation of the child `provider-e2e` target when affected. Restore/build caching may use SDK/lockfile/platform keys; browser e2e stays uncached. Upload `test-results/conformance/dotnet` and `playwright-report/conformance/dotnet` diagnostics on failure.
- [ ] Verify affected selection when child code, core, either framework/host, testing, SDK, NuGet lockfile, npm lockfile, and workflow change. Verify unrelated project changes do not require .NET. Setup must occur before *all* child build/test/lint targets selected by the generic command, not just before e2e.
- [ ] Draft both recipes from the now-passing integration source. Show the two real provider configurations, server-owned credentials/model/deployment, standard framework browser setup, dynamic schema mapping, browser/server tools, full-transcript ownership, and accepted/declined/cancelled resume. Include exact dependency/runtime table and process-local interrupt limits. Test controls, capture proxies, fixture identity, and aimock setup do not appear in application snippets.
- [ ] Add navigation and custom/platform entry links. Extend an existing meaningful menu test if needed; do not snapshot the prose. Run `npx nx test www`, `npx nx lint www`, `npx nx build www`, and `npx nx e2e www` for route/link rendering. Fix broken snippets/links. Commit CI and recipe changes in separate commits if both can be verified independently.

## Task 12: Final verification, review, and support claim

**Files:** only files requiring fixes from verification; update fixture README and compatibility table with observed results, not planned outcomes.

- [ ] Run the full checks below after all changes. Do not count pre-change cache results for changed behavioral tests. Investigate failures under @superpowers:systematic-debugging; do not suppress lints or skip provider cases.
- [ ] Verify documentation source examples compile using the actual reference project, or a minimal task-local application that references only documented helper files and approved packages. This catches snippets accidentally depending on `Testing/` or capture harness services.
- [ ] Review integration code and docs against every accepted specification row. Use @superpowers:requesting-code-review for the completed implementation; resolve material findings and rerun only affected checks plus any mandated package checks.
- [ ] Inspect package/API changes. No core public API should be necessary. If implementation uncovered a runtime bug, include its failing regression test and build/test/lint the affected package; regenerate API reports only if the public surface changed.
- [ ] Commit only intended code/docs/lockfiles. Report four-way matrix results, native provider wire paths observed, exact versions, workaround still needed, and warnings/failures. No PR comment, closure, NuGet publication, or other external mutation is part of this plan.

Final commands (all Nx commands use repository syntax):

```sh
npx nx build dotnet-conformance
npx nx test dotnet-conformance
npx nx lint dotnet-conformance
npx nx provider-e2e dotnet-conformance
npx nx build conformance
npx nx test conformance
npx nx lint conformance
npx nx example-e2e conformance
npx nx build runtime-smoke-react
npx nx test runtime-smoke-react
npx nx lint runtime-smoke-react
npx nx build runtime-smoke-angular
npx nx test runtime-smoke-angular
npx nx lint runtime-smoke-angular
npx nx build www
npx nx test www
npx nx lint www
npx nx e2e www
git diff --check
```

Neither runtime-smoke host currently declares a test target. Before invoking its test command, use `npx nx show project runtime-smoke-react --json` / Angular to check whether an inferred target exists. If there is no test target, report that limitation and use the existing/new Playwright suites as behavioral verification; do not add an empty passing target. If core, React, Angular, or testing library code changes, also run their actual build/test/lint targets, reporting any absent target explicitly rather than claiming it passed.

## Completion checklist

- [ ] NuGet dependency additions were explicitly approved; exact SDK and all NuGet resolutions are pinned.
- [ ] Native OpenAI and Azure client configuration and request evidence are distinct and correct.
- [ ] All four browser/provider combinations pass required scenarios.
- [ ] Request-local schema translation and option immutability are tested at the native wire.
- [ ] Browser/server tool ownership and repeated calls are correct, including across interrupts.
- [ ] Generic application interrupts use upstream serialization and correct full-batch decisions.
- [ ] Duplicate/concurrent/expired resume cannot repeat protected effects.
- [ ] Real cancellation/error/EOF behavior and event schema fidelity are verified.
- [ ] CI actually selects and runs the new suite with a conditionally installed SDK.
- [ ] Recipe snippets compile independently of test infrastructure and state the tested boundary.
- [ ] Required checks and review are complete; no unverified compatibility is advertised.
