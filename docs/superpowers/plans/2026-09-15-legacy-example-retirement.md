# Legacy example inventory and coverage preservation

Status: repository inventory complete; coverage ownership mapped. No source,
Nx target, package, CI check, or deployed resource has been removed. Coverage
relocation described below is still required before retiring Fast Food/Smart Home.
Performance work remains deferred.

## Scope and evidence

Inventory uses tracked files (`git ls-files`), sample project manifests, source
imports, CI configuration and deployment configuration. Generated build output,
node_modules and historical design documents are not active project definitions.
Cloud resource existence, traffic, DNS ownership and secrets have not been queried;
configured deployment targets are not proof of currently running deployments.

Canonical replacement: `samples/invoicing` (React, server, contracts, e2e).
The replacement is React-only; Angular library support and its conformance suite
remain supported independently.

## Source and Nx inventory

| Legacy root | Tracked Nx projects | Retirement dependencies |
|---|---|---|
| `samples/fast-food` | fast-food-angular, fast-food-react, fast-food-server, fast-food-cloudflare | Native OpenAI Express/Worker route tests; public sample page; Cloudflare target; generated-data assets |
| `samples/finance` | finance-angular, finance-react, finance-server, finance-cloudflare | Homepage showcase, sample page, charts/recipe references, Cloudflare target; generated-data assets |
| `samples/smart-home` | smart-home-angular, smart-home-react, smart-home-server, smart-home-cloudflare | Both framework example browser projects, server route test, explicit Storybook/lint CI step, onboarding guides, Cloudflare target |
| `samples/kitchen-sink` | kitchen-sink-angular, kitchen-sink-server | README instructions; NgRx/Angular-specific feature demonstrations and tests |
| `samples/spotify` | spotify-angular, spotify-server | MCP/music integration; historical blog article; package candidates below |
| `samples/lambda-chat` | lambda-chat | AWS streaming Lambda recipe and Serverless deployment config; separate platform example rather than UI showcase |
| `samples/react-vox-demo` | react-vox-demo | Vox/VAD development demo; separate library capability rather than invoicing showcase |

There are 18 tracked legacy project manifests across seven roots. Some targets
are inferred by Nx plugins; an empty targets object does not establish that a
project is unused. Do not include untracked `storybook-static/project.json` as a
project. Lambda and Vox are inventoried but their distinct adapter/development
roles should be explicitly resolved in the eventual deletion scope.

## CI and test ownership

### Keep unchanged

- `tools/runtime-smoke/angular` and `tools/runtime-smoke/react`: independent,
  purpose-built framework fixtures, not legacy showcases.
- `tools/runtime-smoke/e2e/specs`: both-framework request contracts, progressive
  plain/structured/UI output, reasoning, tool continuation, retries/errors,
  cancellation, endpoint interoperability and interrupt/resume lifecycles.
- `tools/runtime-smoke/e2e/harness`: aimock, independent endpoint, event gates,
  browser and terminal-response tests except the sample-specific imports below.
- `tools/testing` and provider/core/Angular/React library suites.
- Invoicing's deterministic `example-e2e` and explicit `live-model` targets.
  These validate the canonical B4 application; they do not replace native OpenAI
  adapter tests or Angular conformance tests.

### Relocate before source removal

| Current dependency | Coverage that must survive | Destination/action |
|---|---|---|
| `tools/runtime-smoke/e2e/harness/openai-route.spec.ts` imports Fast Food Express API and Angular Pages function | Native Hashbrown OpenAI adapter → SSE → HttpTransport; content type, lifecycle and text events on both Node and Worker request surfaces | Put minimal test-owned Express and Worker handlers under `tools/runtime-smoke/e2e/fixtures/provider-routes/`; retain assertions and aimock provider boundary |
| `tools/runtime-smoke/e2e/harness/smart-home-route.spec.ts` imports Smart Home API | Injected provider options, native adapter, canonical SSE, no environment mutation | Consolidate into the Node fixture suite without dropping its injected-configuration case |
| `tools/runtime-smoke/e2e/example-specs/smart-home.spec.ts` imports Smart Home API and drives both showcases | Both frameworks render trusted UI via real native adapter; execute one tool once, change app state and continue; preserve thread/tool history; forward strict response schema; no browser errors | Add native-provider scenarios against the existing independent Angular/React smoke fixtures with a small test-owned server; preserve both no-tool and tool-round scenarios |
| `tools/runtime-smoke/e2e/project.json` includes smart-home projects, build dependencies and `serve-example-*` targets | Correct Nx affected propagation and runnable native-provider browser coverage | Replace sample dependencies with the test-owned fixtures; replace old serving paths/config only when replacement scenarios pass |
| `.github/workflows/pr-main.yml` always runs smart-home-react eslint:lint/build-storybook | Showcase-specific build/tooling validation | Remove this explicit step only with Smart Home retirement, updating `tools/cloudflare/workflow.test.mjs`; keep generic affected checks and canonical browser checks |

The current four Smart Home browser cases are *not* equivalent to the independent
mock-transport suite: they exercise a real provider adapter and real SSE endpoint.
Do not delete them merely because the independent tests pass. The new fixture
route must call HashbrownOpenAI, with only the provider mocked by aimock.

Suggested migration order:

1. Establish the current unit/browser baseline.
2. Add test-owned provider routes and equivalent assertions, leaving old sample
   tests intact until the replacement passes.
3. Add both-framework native-provider browser scenarios to independent fixtures.
4. Compare the assertions above, then remove redundant sample-specific tests and
   replace Nx edges/serve targets. Keep generic and application suites separate.
5. Re-run runtime-smoke test/typecheck/lint/e2e and build/lint for changed fixtures;
   verify Nx affected includes the suite when either adapter/framework changes.

Completion criterion: no executable file under `tools/runtime-smoke` imports
`samples/*`; no smoke target needs legacy app builds; all listed guarantees still
run for their original framework/platform surfaces. This criterion is not met yet.

## Documentation and link inventory

Active migration locations:

- `README.md`: provider example link and Smart Home, Finance, Kitchen Sink commands.
- `CONTRIBUTING.md`: provider setup points at the Smart Home server.
- `www/analog/src/app/components/Header.ts`: three legacy sample navigation links.
- `www/analog/src/app/components/home/Samples.ts`: Finance/Smart Home live demos
  and associated screenshots/copy.
- `www/analog/src/app/pages/samples/{index,finance,fast-food,smart-home}.page.ts`:
  catalog and individual public sample routes.
- `www/analog/src/app/pages/docs/{angular,react}/start/sample.md`: Smart Home
  onboarding/source links and commands. React can use invoicing; Angular needs
  an accurate Angular-specific getting-started path, not React instructions.
- `www/analog/src/app/pages/docs/{angular,react}/recipes/ui-chatbot.md`: old sample
  references; preserve useful framework recipe content while updating links.
- `www/analog/DEPLOY.md`, `AGENTS.md`, `.gitignore`: deployment/project inventories
  and example-specific paths need synchronized cleanup.
- `www/analog/src/content/blog/2025-09-24-spotify-game-with-hashbrown.md`: historical
  article; retain history and pin source links to a surviving commit/archive rather
  than rewriting the article to imply the example is still maintained.
- Historical design plans/security audit records are archival evidence. Do not
  mechanically rewrite every mention; annotate only where they read as current.

Find and reassess referenced sample images/assets when replacing these pages;
remove an asset only after checking its remaining consumers. Preserve old website
routes as redirects/archive notices where appropriate, not broken public links.

## Deployment inventory (configuration only)

`tools/cloudflare/deployment.mjs` owns Pages target definitions:

| Configured project | Configured public URL | Build output |
|---|---|---|
| hashbrown-fast-food | https://fast-food.hashbrown.dev | dist/samples/fast-food/angular/browser |
| hashbrown-finance | https://finance.hashbrown.dev | dist/samples/finance/angular/browser |
| hashbrown-smart-home | https://smart-home.hashbrown.dev | dist/samples/smart-home/angular/browser |

Each also has `samples/<name>/angular/wrangler.toml`. Synchronize target removal
with deployment/deploy/workflow test fixtures in `tools/cloudflare`, preview
comments and docs. Keep the independent `www` deployment target.

`samples/lambda-chat/serverless.ts` configures `lambda-chat-${stage}`, default
stage dev, region us-east-1, a response-streaming function URL and Serverless
plugins. Actual deployed stages/resources are unknown. Do not run its remove
command as part of repository cleanup.

The cloudflare source variants are separate from the listed Angular Pages output;
inspect external bindings/consumers before assuming that removing a Pages target
retires every variant. Canonical hosting and external decommissioning are later
work, not part of this inventory.

## Dependency candidates, not approved removals

Static source-import scan found these concentrated in legacy examples:

- Spotify: `@spotify/web-api-ts-sdk`, `genius-lyrics`, `@modelcontextprotocol/sdk`.
- Kitchen Sink: `@ngrx/{effects,entity,store,store-devtools}`, `sanitize-html`.
- Finance/Fast Food: `@faker-js/faker`, `chart.js`.
- Smart Home: Radix UI packages, `cmdk`, `vaul`, `zustand`, `react-day-picker`,
  `react-markdown`, `lucide-react`, `date-fns`, `class-variance-authority`,
  `tailwind-merge`, Storybook integration, and associated tooling.
- Shared legacy usage: `clsx`, `uuid`, `react-router-dom`, `@angular/animations`.

This scan does not cover plugin strings, CSS imports, peer requirements, generated
schemas or all dynamic loads. Check Nx configuration, package manifests and
`npm explain` before removing any candidate. Express/CORS remain needed for the
proposed native-provider fixtures even after showcase deletion. Retain Angular,
React, provider libraries, testing tools and dependencies required by the docs or
canonical app. Review Serverless/Vox tooling independently; no lockfile edits yet.

## Later removal gate

- Coverage relocation complete and passing.
- Canonical deployment verified and replacement docs/navigation prepared.
- Explicit source scope for Lambda/Vox and platform recipes established.
- Root manifest cleanup validated with npm ls and affected build/test/lint/e2e.
- Hosted-resource/DNS inventory and redirect choices handled separately.

## Verified baseline — September 15, 2026

- `npx nx test runtime-smoke`: 42 tests passed in eight suites.
- `RUNTIME_SMOKE_ANGULAR_PORT=4411 RUNTIME_SMOKE_REACT_PORT=4412 npx nx e2e runtime-smoke`:
  all 56 browser tests passed across Angular and React. Dependent fixture builds
  succeeded. The initial default-port run was blocked by an existing listener on
  4312; it was rerun on separate ports without stopping that unrelated process.
- `npx nx example-e2e runtime-smoke`: all four Smart Home native-provider browser
  cases passed (UI-only and tool continuation for each framework).
- Existing warnings include deprecated Nx Jest executor, Node util._extend and
  conflicting color environment flags. No application or test code changed.

This establishes a preservation baseline, not a claim that fixture extraction
has already happened. All existing suites remain enabled and legacy imports stay
in place until equivalent replacement coverage is introduced.
