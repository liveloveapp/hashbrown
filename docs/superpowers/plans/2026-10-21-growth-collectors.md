# Growth Collectors (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two collectors of the growth design: a dependency-free postinstall collector assembled into the ten published `@hashbrownai/*` packages, and a development-only browser collector in core that reports four milestones through React and Angular, with disclosure in every README, a docs page, and `/privacy`.

**Architecture:** The install collector is CommonJS under `tools/growth/install/`, copied into `dist/packages/<name>/install/` by a post-compile `assemble-package.mjs` step that also adds `postinstall` to the published manifest only. Core only ships a `development-install` token module, read through a `#development-install` imports-map entry whose published default is null. The runtime collector lives in `packages/core/src/growth/`; `createChatRuntime` registers a per-runtime binder (a WeakMap keyed by `runtime.resume`, the pattern `ɵgetRuntimeSchedulingState` already uses), and the framework packages create one collector per provider and attach it to each runtime they create. Milestones are derived from store actions, never from conversation content.

**Tech Stack:** Node 20 CommonJS (`node:https`, `node:fs/promises`, `node:test`), TypeScript, Jest (core, react), Vitest (angular, tools/growth), Playwright (conformance), Next.js App Router (www), Nx targets.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md`, §6.2, §6.3, §10, §14 item 3, §15. The server contract this must satisfy byte-for-byte is `tools/growth/src/lib/observability/contracts.ts` (`parseCollectionBatch`). Reference implementation to mirror: `~/repos/angular-agent-framework/libs/telemetry/install/*.cjs` and `libs/telemetry/src/browser/development/*.ts` (read them; copy structure and safety rules, rename identifiers).

## Global Constraints

- No new dependency in any published package or in `tools/growth`. The install collector uses only `node:*` modules; the runtime collector uses only browser APIs.
- In-repo `packages/*/package.json` never carry `scripts.postinstall`. Only `dist/packages/*/package.json` do, written by `assemble-package.mjs`.
- Core stays framework-agnostic. Internal exports are `ɵ`-prefixed. React and Angular public signatures reference only non-`ɵ` types.
- Public copy (READMEs, docs, `/privacy`, TSDoc, console text) never uses the word "tracking". `DO_NOT_TRACK` as a variable name is the one exception.
- Contract values (copy exactly): install kind `package.installed`; runtime kinds `runtime.session_started`, `runtime.first_stream_completed`, `tool.first_call_executed`, `component.first_rendered`; `packageName` ∈ `@hashbrownai/{core,react,angular,openai,anthropic,azure,bedrock,google,ollama,typesafe}`; `integration` ∈ `react|angular`; `transport` ∈ `http|local|delegating|custom`; `durationBucket` ∈ `lt_1s|1s_to_5s|5s_to_30s|30s_plus`; subject namespaces `installation` and `development_browser`; scopes `persistent|session|memory`; `environment` ∈ `local|ci|unknown` with evidence rules in `contracts.ts`; batches of 1–20 events; UUID v4 ids lowercased; `occurredAt` ISO with milliseconds, within 24 h past / 5 min future; `collectorVersion` matches `/^[0-9A-Za-z._+-]{1,64}$/`.
- Endpoints: install `https://hashbrown.dev/_/growth/collect/v1/install`; runtime `https://hashbrown.dev/_/growth/collect/v1/runtime`. The install collector accepts `HASHBROWN_TELEMETRY_ENDPOINT` only when it parses as a URL whose hostname is `127.0.0.1`, `localhost`, or `[::1]`; anything else is ignored. The browser collector has no endpoint override.
- Install collector: exit 0 on every path, never throws, hard deadline 4,800 ms in `postinstall.cjs`, 4,500 ms soft deadline in `collector.cjs`, 2,500 ms request timeout, no redirects, no response body read.
- Opt-outs: install `DO_NOT_TRACK`, `npm_config_do_not_track`, `NPM_CONFIG_DO_NOT_TRACK`, `HASHBROWN_TELEMETRY_DISABLED` (truthy = `1|true|yes`, case-insensitive), and `npm_lifecycle_event !== 'postinstall'`. Runtime: not development mode, no `window`/`document`, `navigator.webdriver === true`, `localStorage.HASHBROWN_TELEMETRY_DISABLED === '1'`, `window.__HASHBROWN_TELEMETRY_DISABLED__ === true`, `ɵsetDevelopmentCollectionEnabled(false)`, `telemetry: false` on `HashbrownProvider` / `provideHashbrown()`; a child cannot re-enable a disabled parent.
- Runtime collector budgets: ≥ 10 s between requests, ≤ 50 pending, ≤ 20 per request, 3 attempts, 24 h age, 3 s request deadline, honour `Retry-After` on 429/5xx, never poll while idle, replay an acknowledged envelope at most once per 5 min as the exchange envelope.
- Tests: top-level `test(...)` only, arrange/act/assert with blank lines. TSDoc on every export. Run `npx nx build/test/lint <project>` for each touched project before claiming done.
- Commit after each task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A tool call that is stopped before it executes (`stop()` during the tool turn) must not count as `tool.first_call_executed`. Test in Task 7: `toolTurnSettled` without a preceding `toolTurnStarted` reports nothing.
2. A run that finishes with an `interrupt` outcome, or with no `TEXT_MESSAGE_CONTENT`, must not count as `runtime.first_stream_completed`. Tests in Task 7.
3. A factory transport that throws when resolved must classify as `custom` and never break runtime creation. Test in Task 7.
4. A localStorage that throws (private mode, blocked storage) must fall back to page memory with `scope: 'memory'`, and a stored session blob of foreign shape must be discarded. Tests in Task 5.
5. The renderer-only React bundle (`useUiKit` + `useJsonParser`, no provider) must not grow by the collector: `npx nx e2e react` bundle budgets stay green. Check in Task 11.

## File Structure

```
tools/growth/install/
  postinstall.cjs           lifecycle entry; 4,800 ms deadline; exit 0 always
  collector.cjs             collectInstall(): assembles and posts one package.installed
  policy.cjs                truthy, disabled, packageManager, environment
  git-context.cjs           parseConfig, repositoryHint, discoverGit
  identity.cjs              installationIdentity(home) → ~/.hashbrown/installation-id
  files.cjs                 readBounded(path, max)
  bridge.cjs                moduleSource(token, format), writeBridge(packageRoot, token)
  assemble-package.mjs      build step: copies *.cjs, patches dist manifest, writes null bridges
  write-package-version.mjs prepare step: writes packages/<name>/src/package-version.ts
  verify-pack.mjs           install-pack-e2e: packs the ten dists, installs in scratch projects
  *.test.mjs                node:test unit tests (policy, git-context, collector, bridge, identity)
tools/growth/src/lib/packaging.spec.ts   vitest: repo wiring invariants
packages/core/src/growth/
  types.ts                  kinds, option and handle types, constants
  development-install.default.ts  export const installationToken: string | null = null
  session.ts                DevelopmentSession (identity + 30 min session + envelopes)
  announcements.ts          DevelopmentAnnouncements (console-only, code-owned filter)
  collector.ts              DevelopmentCollector (queue, send, ack, retry)
  runtime-binding.ts        registerRuntimeBinder / bindRuntime WeakMap side channel
  runtime.ts                ɵcreateDevelopmentCollector, ɵreportMilestone, ɵsetDevelopmentCollectionEnabled, ɵgetDevelopmentCollectionDiagnostics
  index.ts
packages/core/src/chat-runtime.ts        registers the binder (session start, stream, tool)
packages/react/src/growth/collector.ts   React owner + process.env.NODE_ENV gate + public wrappers
packages/react/src/package-version.ts    generated
packages/angular/src/growth/collector.ts Angular token + isDevMode gate + public wrappers
packages/angular/src/package-version.ts  generated
www/content/docs/{react,angular}/platform/collection.md
www/src/app/privacy/page.tsx
tools/conformance/specs/collection.spec.ts
```

---

### Task 1: Install collector policy, files, identity, bridge

**Files:**
- Create: `tools/growth/install/policy.cjs`, `tools/growth/install/files.cjs`, `tools/growth/install/identity.cjs`, `tools/growth/install/bridge.cjs`
- Test: `tools/growth/install/policy.test.mjs`, `tools/growth/install/bridge.test.mjs`, `tools/growth/install/identity.test.mjs`
- Modify: `tools/growth/project.json` (`test` target command `node --test tools/growth/scripts/**/*.test.mjs` becomes `node --test "tools/growth/scripts/**/*.test.mjs" "tools/growth/install/*.test.mjs"`)

**Interfaces:**
- Produces (CommonJS exports):
  - `policy.cjs`: `truthy(value: unknown): boolean`; `disabled(env: NodeJS.ProcessEnv): boolean` (keys `DO_NOT_TRACK`, `npm_config_do_not_track`, `NPM_CONFIG_DO_NOT_TRACK`, `HASHBROWN_TELEMETRY_DISABLED`); `packageManager(agent: unknown): { packageManager: 'npm'|'pnpm'|'yarn'|'bun'|'unknown'; packageManagerVersion?: string }`; `environment(env, interactive: boolean, manager: string): { environment: 'ci'|'local'|'unknown'; environmentEvidence: string; ciProvider?: string }` with the indicator list and order from threadplane `policy.cjs` (`github_actions`, `gitlab_ci`, `jenkins`, `travis`, `circleci`, `bitbucket`, `buildkite`, `generic_ci`); `endpoint(env): string` returning `HASHBROWN_TELEMETRY_ENDPOINT` when its hostname is loopback, else `https://hashbrown.dev/_/growth/collect/v1/install`.
  - `files.cjs`: `readBounded(path: string, maximum = 65536): Promise<string | null>` (copy threadplane).
  - `identity.cjs`: `installationIdentity(home: string): Promise<{ id: string; scope: 'persistent'|'memory' }>` using `~/.hashbrown/installation-id` (copy threadplane, rename directory).
  - `bridge.cjs`: `moduleSource(token: string | null, format: 'esm'|'cjs'): string` producing `export const installationToken = <json>;\n` or `'use strict';\nexports.installationToken = <json>;\n`; `writeBridge(packageRoot: string, token: string | null): Promise<boolean>` writing both `development-install.mjs` and `development-install.cjs` at `packageRoot` atomically (temp + rename, like threadplane), returning false if either fails; `BRIDGE_FILES = ['development-install.mjs', 'development-install.cjs']`.

- [ ] **Step 1: Write failing tests** (node:test, top-level `test`, arrange/act/assert)

```js
// policy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const policy = require('./policy.cjs');

test('disabled honours every opt-out key', () => {
  const cases = ['DO_NOT_TRACK', 'npm_config_do_not_track', 'NPM_CONFIG_DO_NOT_TRACK', 'HASHBROWN_TELEMETRY_DISABLED'];

  const results = cases.map((key) => policy.disabled({ [key]: 'true' }));

  assert.deepEqual(results, [true, true, true, true]);
  assert.equal(policy.disabled({ DO_NOT_TRACK: '0' }), false);
});
test('environment reports github actions as ci with matching evidence', () => { /* GITHUB_ACTIONS=true, CI=true → { environment: 'ci', environmentEvidence: 'github_actions', ciProvider: 'github_actions' } */ });
test('environment reports an interactive npm as local', () => { /* interactive true, manager 'npm' → { environment: 'local', environmentEvidence: 'interactive_package_manager' } with no ciProvider */ });
test('environment reports unknown when neither', () => { /* → { environment: 'unknown', environmentEvidence: 'unknown' } */ });
test('packageManager parses the npm user agent', () => { /* 'pnpm/9.1.0 npm/? node/v20' → { packageManager: 'pnpm', packageManagerVersion: '9.1.0' } */ });
test('endpoint accepts only a loopback override', () => {
  assert.equal(policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: 'http://127.0.0.1:3000/_/growth/collect/v1/install' }), 'http://127.0.0.1:3000/_/growth/collect/v1/install');
  assert.equal(policy.endpoint({ HASHBROWN_TELEMETRY_ENDPOINT: 'https://evil.example/collect' }), 'https://hashbrown.dev/_/growth/collect/v1/install');
  assert.equal(policy.endpoint({}), 'https://hashbrown.dev/_/growth/collect/v1/install');
});
```

```js
// bridge.test.mjs
test('moduleSource renders esm and cjs null modules', () => {
  assert.equal(bridge.moduleSource(null, 'esm'), 'export const installationToken = null;\n');
  assert.equal(bridge.moduleSource(null, 'cjs'), "'use strict';\nexports.installationToken = null;\n");
});
test('writeBridge writes both files atomically and returns true', async () => { /* mkdtemp; writeBridge(dir, uuid); read both files; assert contents; assert no .tmp leftovers */ });
test('writeBridge returns false when the package root is a file', async () => { /* path to a regular file → false */ });
```

```js
// identity.test.mjs
test('installationIdentity creates then reuses a persistent id', async () => { /* mkdtemp home; call twice; same lowercase uuid, scope persistent, file mode 0o600 */ });
test('installationIdentity falls back to memory when home is unwritable', async () => { /* home is a file path → scope memory, id is a uuid */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/growth/install/*.test.mjs`
Expected: FAIL with `Cannot find module './policy.cjs'`

- [ ] **Step 3: Implement the four modules** by copying threadplane's `policy.cjs`, `files.cjs`, `identity.cjs`, `bridge.cjs` and renaming: `TPLANE_TELEMETRY_DISABLED` → `HASHBROWN_TELEMETRY_DISABLED`; `.threadplane` → `.hashbrown`; bridge writes two files at `packageRoot` (not `.install-collector/`), add `endpoint(env)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/growth/install/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Update the growth `test` target and run it**

Run: `npx nx test growth`
Expected: PASS (existing vitest and script tests still pass)

- [ ] **Step 6: Commit**

```bash
git add tools/growth/install tools/growth/project.json
git commit -m "feat(growth): install collector policy, identity, and bridge modules"
```

---

### Task 2: Git context discovery

**Files:**
- Create: `tools/growth/install/git-context.cjs`
- Test: `tools/growth/install/git-context.test.mjs`

**Interfaces:**
- Produces: `parseConfig(text: string): { name?: string; email?: string; remote?: string; worktreeConfig?: boolean }`; `repositoryHint(remote: unknown): { repositoryProvider?: 'github'|'gitlab'|'bitbucket'; repositoryOwner?: string }`; `discoverGit({ home, packageRoot, env }): Promise<{ consumerContext: 'checkout'|'unavailable'; identity: { gitDisplayName?, gitEmail?, gitConfigOrigin?: 'local'|'global'|'unknown', repositoryProvider?, repositoryOwner? } }>`.
- Consumes: `readBounded` (Task 1), `truthy`, `packageManager` (Task 1).

- [ ] **Step 1: Write failing tests**

```js
test('parseConfig reads user and origin remote', () => {
  const text = '[user]\n\tname = Dev\n\temail = Dev@Example.com\n[remote "origin"]\n\turl = git@github.com:acme/widgets.git\n';

  const result = parseConfig(text);

  assert.deepEqual(result, { name: 'Dev', email: 'Dev@Example.com', remote: 'git@github.com:acme/widgets.git' });
});
test('repositoryHint reports the owner for ssh and https remotes and nothing else', () => {
  assert.deepEqual(repositoryHint('https://token@github.com/acme/widgets.git'), { repositoryProvider: 'github', repositoryOwner: 'acme' });
  assert.deepEqual(repositoryHint('git@gitlab.com:team/app'), { repositoryProvider: 'gitlab', repositoryOwner: 'team' });
  assert.deepEqual(repositoryHint('https://git.corp.example/acme/widgets.git'), {});
});
test('discoverGit merges global identity with the consuming checkout', async () => {
  /* mkdtemp root with home/.gitconfig ([user] name=Global) and project/.git/config ([user] email=dev@example.com, remote origin github acme);
     env INIT_CWD=project, npm_config_user_agent='npm/10.0.0 node/v20';
     packageRoot = project/node_modules/@hashbrownai/core (mkdir) →
     { consumerContext: 'checkout', identity: { gitDisplayName: 'Global', gitEmail: 'dev@example.com', gitConfigOrigin: 'unknown', repositoryProvider: 'github', repositoryOwner: 'acme' } } */
});
test('discoverGit reports unavailable without INIT_CWD and never reads a global remote as a hint', async () => { /* no INIT_CWD, global config has remote → consumerContext 'unavailable', no repositoryOwner */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/growth/install/git-context.test.mjs`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement** by copying threadplane `git-context.cjs` verbatim (it has no product names).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/growth/install/git-context.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/growth/install/git-context.cjs tools/growth/install/git-context.test.mjs
git commit -m "feat(growth): install collector git context discovery"
```

---

### Task 3: Install collector and postinstall entry

**Files:**
- Create: `tools/growth/install/collector.cjs`, `tools/growth/install/postinstall.cjs`
- Test: `tools/growth/install/collector.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `collectInstall({ packageRoot, env?, getHome?, readPackage?, identify?, discover?, send?, interactive?, deadline?, now?, log? }): Promise<void>`; `sendBatch(batch, { timeoutMs, endpoint }): Promise<void>`; `PACKAGES: Set<string>` of the ten names; `TOKEN_PACKAGE = '@hashbrownai/core'`.
- Event shape (exactly): `{ eventId, kind: 'package.installed', occurredAt, collectorVersion: 'install-v1', subject: { id, namespace: 'installation', scope }, installationToken?, properties: { packageName, packageVersion, osFamily: os.platform(), architecture: os.arch(), nodeVersion: process.versions.node, packageManager?, packageManagerVersion?, environment, environmentEvidence, ciProvider?, consumerContext }, identity? }`.
- Behaviour differences from threadplane: the bridge is reset and written **only when `pkg.name === TOKEN_PACKAGE`**; other packages never touch bridge files. `HASHBROWN_TELEMETRY_DEBUG` truthy → `log(JSON.stringify({ endpoint, batch }, null, 2))` and no send. Endpoint from `policy.endpoint(env)`.

- [ ] **Step 1: Write failing tests** (inject `send`, `identify`, `discover`, `readPackage`; no network, no real home)

```js
test('collectInstall posts one package.installed for a provider package without a token', async () => {
  const sent = [];
  const env = { npm_lifecycle_event: 'postinstall', npm_config_user_agent: 'npm/10.0.0 node/v20.0.0' };

  await collectInstall({ packageRoot: dirOf('@hashbrownai/openai', '0.7.0'), env, interactive: true,
    identify: async () => ({ id: UUID_A, scope: 'persistent' }),
    discover: async () => ({ consumerContext: 'checkout', identity: { gitEmail: 'dev@example.com', gitConfigOrigin: 'local' } }),
    send: async (batch) => { sent.push(batch); } });

  assert.equal(sent.length, 1);
  const [event] = sent[0].events;
  assert.equal(event.kind, 'package.installed');
  assert.equal(event.installationToken, undefined);
  assert.deepEqual(event.properties, { packageName: '@hashbrownai/openai', packageVersion: '0.7.0', osFamily: os.platform(), architecture: os.arch(), nodeVersion: process.versions.node, packageManager: 'npm', packageManagerVersion: '10.0.0', environment: 'local', environmentEvidence: 'interactive_package_manager', consumerContext: 'checkout' });
  assert.deepEqual(event.identity, { gitEmail: 'dev@example.com', gitConfigOrigin: 'local' });
  assert.equal(await exists(join(root, 'development-install.mjs')), false);
});
test('collectInstall writes a token for core and cites it', async () => { /* name core; after call development-install.mjs == `export const installationToken = "<token>";\n`, event.installationToken === token, token is uuid v4 */ });
test('collectInstall in CI resets the core token to null and sends no identity', async () => { /* pre-write a stale token; env GITHUB_ACTIONS=true → bridge files null, event.environment 'ci', ciProvider 'github_actions', no installationToken, no identity */ });
test('collectInstall sends nothing when disabled but still resets the core token', async () => { /* DO_NOT_TRACK=1; stale token → files null; sent.length 0 */ });
test('collectInstall sends nothing for an unknown package name', async () => { /* name '@acme/other' → sent.length 0 */ });
test('collectInstall in debug mode logs the payload and sends nothing', async () => { /* HASHBROWN_TELEMETRY_DEBUG=1; log captured includes '"endpoint"' and 'package.installed'; sent.length 0 */ });
test('collectInstall swallows a throwing send', async () => { /* send rejects → resolves without throwing */ });
test('sendBatch posts JSON to the endpoint with no redirect following', async () => { /* local http server records method/headers/body; endpoint override http://127.0.0.1:<port>/x; assert content-type application/json, body parses, no authorization/cookie headers */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tools/growth/install/collector.test.mjs`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `collector.cjs` and `postinstall.cjs`** by adapting threadplane's. `sendBatch` must work for both `http:` and `https:` endpoints (pick `node:http` or `node:https` by protocol) because the loopback override is plain http. `postinstall.cjs` is threadplane's verbatim with `packageRoot: join(__dirname, '..')`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tools/growth/install/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/growth/install
git commit -m "feat(growth): install collector and postinstall entry"
```

---

### Task 4: Package assembly, version files, and repo wiring

**Files:**
- Create: `tools/growth/install/assemble-package.mjs`, `tools/growth/install/write-package-version.mjs`, `packages/react/src/package-version.ts`, `packages/angular/src/package-version.ts`, `packages/core/src/growth/development-install.default.ts`
- Modify: `packages/core/package.json` (`imports`, `files`), `packages/react/package.json` (`files`), `tsconfig.base.json` (`paths`), `packages/{core,react,angular,openai,anthropic,azure,bedrock,google,ollama,typesafe}/project.json`
- Test: `tools/growth/src/lib/packaging.spec.ts` (vitest)

**Interfaces:**
- `assemble-package.mjs <name>`: reads `packages/<name>/package.json` and asserts `scripts?.postinstall === undefined`; reads `dist/packages/<name>/package.json`; sets `scripts.postinstall = 'node install/postinstall.cjs'`; copies `postinstall collector policy git-context identity files bridge` `.cjs` into `dist/packages/<name>/install/`; when `<name> === 'core'` writes `development-install.mjs`, `development-install.cjs`, `development-install.null.mjs`, `development-install.null.cjs` (all null via `bridge.moduleSource`) and `development-install.d.ts` (`export declare const installationToken: string | null;`) at the dist root and asserts the dist manifest has the `imports` entry below. Exits non-zero with a clear message on any assertion failure.
- `write-package-version.mjs <name>` writes `packages/<name>/src/package-version.ts` containing exactly:
  ```ts
  // Generated by tools/growth/install/write-package-version.mjs from package.json. Do not edit.
  // prettier-ignore
  export const PACKAGE_VERSION = "0.7.0";
  ```
  (idempotent: only writes when content differs). Only `react` and `angular` are valid names.
- `packages/core/package.json` gains:
  ```json
  "imports": {
    "#development-install": {
      "development": { "import": "./development-install.mjs", "require": "./development-install.cjs" },
      "import": "./development-install.null.mjs",
      "require": "./development-install.null.cjs"
    }
  }
  ```
  and `files` gains `"install/*.cjs"`, `"development-install.*"`. `packages/react/package.json` `files` gains `"install/*.cjs"`.
- `tsconfig.base.json` `paths` gains `"#development-install": ["packages/core/src/growth/development-install.default.ts"]`. That file: `/** Installation token written by the core postinstall step; null in source and in every published default. */ export const installationToken: string | null = null;`
- Nx wiring, every one of the ten `project.json`: rename the existing `build` target to `compile` (keep its options and `dependsOn`, change `outputs` unchanged); add
  ```json
  "build": {
    "executor": "nx:run-commands",
    "dependsOn": ["compile"],
    "inputs": ["{workspaceRoot}/tools/growth/install/*.cjs", "{workspaceRoot}/tools/growth/install/assemble-package.mjs", "{projectRoot}/package.json"],
    "outputs": ["{workspaceRoot}/dist/packages/<name>"],
    "options": { "command": "node tools/growth/install/assemble-package.mjs <name>" }
  }
  ```
  For `react` and `angular` also add `"prepare": { "executor": "nx:run-commands", "inputs": ["{projectRoot}/package.json"], "outputs": ["{projectRoot}/src/package-version.ts"], "options": { "command": "node tools/growth/install/write-package-version.mjs <name>" } }` and make `compile.dependsOn` include `"prepare"`. Core `compile` gets rollup option `"external": ["#development-install"]`. Any target that previously depended on `build` of the same project (e2e, build-api-report) keeps depending on `build`.

- [ ] **Step 1: Write failing vitest** `tools/growth/src/lib/packaging.spec.ts`

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
const root = resolve(import.meta.dirname, '../../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const PACKAGES = ['core','react','angular','openai','anthropic','azure','bedrock','google','ollama','typesafe'];

test('in-repo manifests carry no lifecycle scripts', () => {
  const scripts = PACKAGES.map((name) => json(`packages/${name}/package.json`).scripts?.postinstall);

  expect(scripts).toEqual(PACKAGES.map(() => undefined));
  expect(json('package.json').scripts.postinstall).toBeUndefined();
});
test('every package build assembles the install collector after compile', () => {
  for (const name of PACKAGES) {
    const project = json(`packages/${name}/project.json`);

    expect(project.targets.build.options.command).toBe(`node tools/growth/install/assemble-package.mjs ${name}`);
    expect(project.targets.build.dependsOn).toContain('compile');
    expect(project.targets.compile).toBeDefined();
  }
});
test('core reads the installation token through the imports map', () => {
  const pkg = json('packages/core/package.json');

  expect(pkg.imports['#development-install']).toEqual({ development: { import: './development-install.mjs', require: './development-install.cjs' }, import: './development-install.null.mjs', require: './development-install.null.cjs' });
  expect(pkg.files).toEqual(expect.arrayContaining(['install/*.cjs', 'development-install.*']));
  expect(json('packages/core/project.json').targets.compile.options.external).toEqual(['#development-install']);
  expect(json('tsconfig.base.json').compilerOptions.paths['#development-install']).toEqual(['packages/core/src/growth/development-install.default.ts']);
});
test('react and angular embed their published version', () => {
  for (const name of ['react', 'angular']) {
    const version = json(`packages/${name}/package.json`).version;

    const source = readFileSync(resolve(root, `packages/${name}/src/package-version.ts`), 'utf8');

    expect(source).toContain(`export const PACKAGE_VERSION = ${JSON.stringify(version)};`);
    expect(json(`packages/${name}/project.json`).targets.compile.dependsOn).toContain('prepare');
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config tools/growth/vitest.config.mts packaging`
Expected: FAIL on every test

- [ ] **Step 3: Implement the scripts, generated files, manifests, tsconfig paths, and the ten `project.json` edits.**

- [ ] **Step 4: Run the vitest, then build core, react, angular, openai and inspect dist**

Run: `npx vitest run --config tools/growth/vitest.config.mts packaging` → PASS
Run: `npx nx run-many -t build -p core react angular openai` → succeeds
Run: `ls dist/packages/core/install dist/packages/core/development-install.* && node -e "const p=require('./dist/packages/core/package.json');console.log(p.scripts.postinstall, Object.keys(p.imports))"`
Expected: 7 `.cjs` files, 5 `development-install.*` files, `node install/postinstall.cjs [ '#development-install' ]`
Run: `grep -rn "development-install" dist/packages/core/growth/*.esm.js | head -3`
Expected: an `import ... from '#development-install'` kept as a bare specifier (not inlined)

- [ ] **Step 5: Run existing checks that touch build wiring**

Run: `npx nx run-many -t lint -p core react angular growth` → PASS
Run: `npx nx e2e core` → PASS (`package-shape.e2e.spec.ts` still passes with the extra files)

- [ ] **Step 6: Commit**

```bash
git add tools/growth tsconfig.base.json packages/*/project.json packages/core/package.json packages/react/package.json packages/react/src/package-version.ts packages/angular/src/package-version.ts packages/core/src/growth/development-install.default.ts
git commit -m "build(growth): assemble the install collector into every published package"
```

---

### Task 5: Core runtime collector session and announcements

**Files:**
- Create: `packages/core/src/growth/types.ts`, `packages/core/src/growth/session.ts`, `packages/core/src/growth/announcements.ts`
- Test: `packages/core/src/growth/session.spec.ts`, `packages/core/src/growth/announcements.spec.ts` (Jest; use `@jest-environment jsdom` docblock if jsdom is available in the preset, otherwise stub `window`/`localStorage` on `globalThis` in arrange and restore in a `finally`)

**Interfaces:**
- `types.ts` exports (internal to core; re-exported with `ɵ` names in Task 8):
  ```ts
  export type DevelopmentIntegration = 'react' | 'angular';
  export type DevelopmentMilestone = 'runtime.first_stream_completed' | 'tool.first_call_executed' | 'component.first_rendered';
  export type DevelopmentTransportKind = 'http' | 'local' | 'delegating' | 'custom';
  export interface DevelopmentCollectorOptions { integration: DevelopmentIntegration; packageName: '@hashbrownai/react' | '@hashbrownai/angular'; packageVersion: string; isDevelopment: () => boolean; enabled?: () => boolean; }
  export interface DevelopmentCollector { attach(runtime: { readonly resume: (options: ResumeOptions) => void }): () => void; dispose(): void; }
  export interface DevelopmentCollectionDiagnostics { acknowledged: number; failures: number; discarded: number; pending: number; }
  export interface RuntimeOwner { options: DevelopmentCollectorOptions; allowed(): boolean; transport(): DevelopmentTransportKind; }
  export interface RuntimeEvent { eventId; kind: 'runtime.session_started' | DevelopmentMilestone; occurredAt; collectorVersion: '1'; subject: { id; namespace: 'development_browser'; scope: 'persistent' | 'memory' }; sessionId; installationToken?; properties: Record<string, string>; }
  export const MILESTONES, MAX_AGE = 86_400_000, SESSION_IDLE = 1_800_000, UUID regex, ENDPOINT = 'https://hashbrown.dev/_/growth/collect/v1/runtime', PACKAGE_NAMES (ten), VERSION regex /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
  ```
- `session.ts`: `class DevelopmentSession { touch(now): { subject; sessionId }; initialization(options, transport: DevelopmentTransportKind, identity, now): RuntimeEvent; claim(key: string): boolean }`. Storage keys `hashbrown.growth.browser.v1`, `hashbrown.growth.session.v1`. Valid claim keys `${integration}:${kind}` for both integrations and all four kinds. The initialization envelope carries `properties: { integration, packageName, packageVersion, transport }` and restarts when `packageVersion`, `installationToken`, or age changes (not on transport change).
- `announcements.ts`: `class DevelopmentAnnouncements { display(input: unknown, events: RuntimeEvent[]): void }`; storage key `hashbrown.growth.announcements.v1:<subjectId>`; accepts items `{ id, text, expiresAt, packageNames ⊆ PACKAGE_NAMES (≤ 10), minVersion, maxVersion?, documentationUrl? matching /^https:\/\/hashbrown\.dev\/docs(?:\/[a-zA-Z0-9._~-]+)*\/?$/ }`; prints `console.info('[Hashbrown] %s', text + optional '\n' + url)` once per id per identity.

- [ ] **Step 1: Write failing tests**

```ts
test('touch creates a persistent browser identity and a session', () => { /* fresh storage → scope 'persistent', uuid ids; second touch same subject and session */ });
test('touch starts a new session after thirty minutes idle', () => { /* lastActive = now - SESSION_IDLE → different sessionId, same subject */ });
test('touch falls back to memory when localStorage throws', () => { /* getItem throws → scope 'memory' */ });
test('touch discards a session blob of foreign shape', () => { /* store '{"id":"x"}' → fresh uuid session */ });
test('initialization reuses the envelope until version or token changes', () => { /* same eventId twice; new version → new eventId; properties include transport 'http' */ });
test('claim accepts each integration milestone once', () => { /* 'react:tool.first_call_executed' true then false; 'react:bogus' false */ });
test('display prints an applicable announcement once and remembers it', () => { /* console.info spy; valid item for @hashbrownai/react 0.7.0 → called once with '[Hashbrown] %s'; second display → still once */ });
test('display ignores expired, foreign-link, or unmatched announcements', () => { /* three items → no console.info */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test core --testPathPattern=growth`
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement** by porting threadplane `types.ts`, `session.ts`, `announcements.ts` with the renames above and `transport` in the start envelope.

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test core --testPathPattern=growth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/growth
git commit -m "feat(core): development collector session and announcements"
```

---

### Task 6: Core development collector queue and transport

**Files:**
- Create: `packages/core/src/growth/collector.ts`
- Test: `packages/core/src/growth/collector.spec.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces: `class DevelopmentCollector { diagnostics(): DevelopmentCollectionDiagnostics; clear(): void; prune(): void; touch(owner: RuntimeOwner, kind?: DevelopmentMilestone, durationMs?: number): void }` — port of threadplane `collector.ts` with: endpoint `ENDPOINT`; event `properties: { integration, packageName, packageVersion, transport: owner.transport() }` plus `durationBucket` on `runtime.first_stream_completed` (thresholds 1,000 / 5,000 / 30,000 ms); `fetch` with `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'`; ack parsing exactly `{ schemaVersion: 1, events: [{ eventId, disposition: 'accepted'|'duplicate'|'redacted' }], announcements? }`; `Retry-After` seconds or HTTP date; 4xx other than 429 exhausts the batch's attempts. Constructor takes `{ fetch?: typeof fetch; now?: () => number; setTimeout?/clearTimeout? }` for tests, defaulting to globals.

- [ ] **Step 1: Write failing tests** (fake `fetch`, fake timers via `jest.useFakeTimers()`)

```ts
test('touch enqueues the session start and a milestone and posts one batch after the interval', async () => { /* owner allowed; touch(owner); touch(owner,'tool.first_call_executed'); advance timers; fetch called once with 2 events; kinds in order; every event has transport 'http' and sessionId */ });
test('an accepted acknowledgment drains the queue and counts', async () => { /* ack both → diagnostics { acknowledged: 2, pending: 0, failures: 0, discarded: 0 } */ });
test('a 429 with Retry-After defers the next request', async () => { /* first fetch 429 Retry-After 30 → no second fetch before 30 s; after → retried */ });
test('a 400 exhausts attempts and discards after prune', async () => { /* 400 → attempts 3 → discarded 1 after next touch */ });
test('milestones deduplicate per integration and session', async () => { /* same kind twice → one event */ });
test('duration buckets follow the thresholds', async () => { /* 999 → lt_1s; 4999 → 1s_to_5s; 29999 → 5s_to_30s; 30000 → 30s_plus (four owners/sessions, or inspect bucket helper) */ });
test('clear aborts the in-flight request and empties the queue', async () => { /* fetch pending; clear(); signal aborted; pending 0 */ });
test('pending work is capped at fifty events', async () => { /* 60 touches across distinct keys impossible—use 60 distinct owners' integration keys? Instead push via replay: assert pending ≤ 50 and discarded counts the overflow */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test core --testPathPattern=growth/collector`
Expected: FAIL

- [ ] **Step 3: Implement `collector.ts`** (port; the only algorithmic choice left open is the retry backoff, which is `MIN_INTERVAL * 2 ** (attempts - 1)` as in threadplane).

- [ ] **Step 4: Run to verify they pass**

Run: `npx nx test core --testPathPattern=growth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/growth
git commit -m "feat(core): development collector queue and exchange"
```

---

### Task 7: Runtime binding and milestone hooks in createChatRuntime

**Files:**
- Create: `packages/core/src/growth/runtime-binding.ts`
- Modify: `packages/core/src/chat-runtime.ts` (register a binder after `runtime` is built, next to `runtimeMessagePreflights.set`)
- Test: `packages/core/src/growth/runtime-binding.spec.ts`, `packages/core/src/chat-runtime-growth.spec.ts`

**Interfaces:**
- `runtime-binding.ts`:
  ```ts
  export interface RuntimeGrowthObserver { sessionStarted(transport: DevelopmentTransportKind): void; streamCompleted(durationMs: number | undefined): void; toolExecuted(): void; }
  export type RuntimeGrowthBinder = (observer: RuntimeGrowthObserver) => () => void;
  export function registerRuntimeBinder(key: object, binder: RuntimeGrowthBinder): void;   // WeakMap<object, RuntimeGrowthBinder>
  export function bindRuntime(key: object, observer: RuntimeGrowthObserver): (() => void) | undefined;
  export function classifyTransport(provider: TransportOrFactory | undefined): DevelopmentTransportKind;
  ```
  `classifyTransport`: `undefined` → `'http'`; resolve with `resolveTransport` inside try/catch (throw → `'custom'`); by `name`: `'HttpTransport'` → `http`; `'ExperimentalChromeLocalTransport' | 'ExperimentalEdgeLocalTransport'` → `local`; `'DelegatingLocalPromptTransport'` → `delegating`; else `custom`.
- In `createChatRuntime`, after `runtime` exists:
  ```ts
  registerRuntimeBinder(runtime.resume, (observer) => {
    observer.sessionStarted(classifyTransport(state.read(selectTransport)));
    // stream: generateMessageStart marks runStartedAt and contentSeen=false; generateMessageEvent with
    // TEXT_MESSAGE_CONTENT sets contentSeen; RUN_FINISHED whose outcome is not interrupt and contentSeen
    // → streamCompleted(Date.now() - runStartedAt) once.
    // tool: toolTurnStarted records the toolTurnId; toolTurnSettled with that id → toolExecuted() once.
    return () => { /* unsubscribe every state.when */ };
  });
  ```
  Only `action.payload` fields already present are read: `event.type`, `event.outcome?.type`, `toolTurnId`. Never message content, tool names, arguments, or schemas.

- [ ] **Step 1: Write failing tests**

```ts
// runtime-binding.spec.ts
test('classifyTransport maps known transports and defaults', () => {
  expect(classifyTransport(undefined)).toBe('http');
  expect(classifyTransport(createHttpTransport({}))).toBe('http');
  expect(classifyTransport({ name: 'DelegatingLocalPromptTransport', send: async () => { throw new Error(); } })).toBe('delegating');
  expect(classifyTransport({ name: 'Mine', send: async () => { throw new Error(); } })).toBe('custom');
  expect(classifyTransport(() => { throw new Error('boom'); })).toBe('custom');
});
test('bindRuntime returns undefined for an unknown key', () => { /* {} → undefined */ });

// chat-runtime-growth.spec.ts (drive a runtime with a fake transport that yields scripted AG-UI events; see chat-runtime.spec.ts for the existing fake-transport helpers)
test('binding a runtime reports the session start with its transport', () => { /* createChatRuntime({ system, transport: fake }) ; bindRuntime(runtime.resume, observer) → sessionStarted('custom') */ });
test('the first run with text content reports a stream completion once', async () => { /* RUN_STARTED, TEXT_MESSAGE_START/CONTENT/END, RUN_FINISHED success → streamCompleted called once with a finite duration; a second run → not called again */ });
test('a run without content or with an interrupt outcome reports no stream completion', async () => { /* two runtimes: empty run; interrupt outcome → streamCompleted not called */ });
test('a settled tool turn that started reports one tool execution', async () => { /* tool with handler resolving; run emits TOOL_CALL_*; RUN_FINISHED → toolExecuted once */ });
test('a tool turn settled without starting reports nothing', async () => { /* dispatch internalActions.toolTurnSettled directly on the store, or stop() during the tool turn → toolExecuted not called */ });
test('detaching stops further reports', async () => { /* detach(); run → nothing */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test core --testPathPattern="growth|chat-runtime-growth"`
Expected: FAIL

- [ ] **Step 3: Implement `runtime-binding.ts` and the registration in `chat-runtime.ts`.**

- [ ] **Step 4: Run the whole core suite**

Run: `npx nx test core`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/growth/runtime-binding.ts packages/core/src/growth/runtime-binding.spec.ts packages/core/src/chat-runtime.ts packages/core/src/chat-runtime-growth.spec.ts
git commit -m "feat(core): bind development milestones to chat runtime actions"
```

---

### Task 8: Core public growth API

**Files:**
- Create: `packages/core/src/growth/runtime.ts`, `packages/core/src/growth/index.ts`
- Modify: `packages/core/src/public_api.ts`, `packages/core/jest.config.ts` (add `moduleNameMapper: { '^#development-install$': '<rootDir>/src/growth/development-install.default.ts' }` only if the nx resolver does not already honour the tsconfig path; verify first)
- Test: `packages/core/src/growth/runtime.spec.ts`

**Interfaces:**
- `runtime.ts`:
  ```ts
  export function createDevelopmentCollector(options: DevelopmentCollectorOptions): DevelopmentCollector;
  export function reportMilestone(collector: DevelopmentCollector, kind: DevelopmentMilestone, detail?: { transport?: DevelopmentTransportKind; durationMs?: number }): void;
  export function setDevelopmentCollectionEnabled(value: boolean): void;   // false clears the shared collector
  export function getDevelopmentCollectionDiagnostics(): DevelopmentCollectionDiagnostics;
  ```
  `createDevelopmentCollector` validates `integration`, `packageName === '@hashbrownai/<integration>'`, `packageVersion` matches `VERSION`; reads `installationToken` from `#development-install` once (kept only when it matches `UUID`); `allowed()` = not disposed ∧ `options.enabled?.() ?? true` ∧ `options.isDevelopment()` ∧ `browserAllowed()`; `browserAllowed()` = module `enabled` flag ∧ `typeof window/document !== 'undefined'` ∧ `navigator.webdriver !== true` ∧ `window.__HASHBROWN_TELEMETRY_DISABLED__ !== true` ∧ `localStorage.getItem('HASHBROWN_TELEMETRY_DISABLED') !== '1'` (try/catch) ∧ `crypto.randomUUID` and `fetch` exist. `attach(runtime)` calls `bindRuntime(runtime.resume, observer)`: `sessionStarted(t)` stores `lastTransport = t` and `collector.touch(owner)`; `streamCompleted(ms)` → `touch(owner, 'runtime.first_stream_completed', ms)`; `toolExecuted()` → `touch(owner, 'tool.first_call_executed')`; returns the detach (or a no-op when the key is unknown). `reportMilestone` → `touch(owner, kind, detail?.durationMs)` with `owner.transport()` returning `detail?.transport ?? lastTransport ?? 'http'`. Every entry point is wrapped in try/catch and never throws into the app. The shared `DevelopmentCollector` instance is created lazily on first allowed use, never at import.
- `public_api.ts` adds:
  ```ts
  export { createDevelopmentCollector as ɵcreateDevelopmentCollector, reportMilestone as ɵreportMilestone, setDevelopmentCollectionEnabled as ɵsetDevelopmentCollectionEnabled, getDevelopmentCollectionDiagnostics as ɵgetDevelopmentCollectionDiagnostics, type DevelopmentCollector as ɵDevelopmentCollector, type DevelopmentCollectorOptions as ɵDevelopmentCollectorOptions, type DevelopmentMilestone as ɵDevelopmentMilestone, type DevelopmentTransportKind as ɵDevelopmentTransportKind } from './growth';
  export type { DevelopmentCollectionDiagnostics } from './growth';   // public: referenced by React and Angular signatures
  ```

- [ ] **Step 1: Write failing tests** (jest env node; stub browser globals per test)

```ts
test('the collector is inert without a window', () => { /* node: createDevelopmentCollector(...).attach(runtime) → fetch spy never called; diagnostics all zero */ });
test('the collector is inert when webdriver is true', () => { /* window+document+localStorage stubs, navigator.webdriver true → no fetch */ });
test('the collector is inert outside development mode', () => { /* isDevelopment false → no fetch */ });
test('the localStorage and window opt-outs win', () => { /* each → no fetch */ });
test('setDevelopmentCollectionEnabled(false) stops collection and clears pending work', () => { /* enabled stubs; attach; then disable → pending 0, no later fetch */ });
test('an allowed browser reports the session start and milestones', async () => { /* full stubs incl. crypto.randomUUID, fetch spy; attach; reportMilestone(component.first_rendered); advance timers → one fetch with runtime.session_started + component.first_rendered, properties transport 'http', packageName '@hashbrownai/react' */ });
test('createDevelopmentCollector rejects a mismatched package name', () => { /* integration react, packageName angular → attach does nothing (allowed false) */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test core --testPathPattern=growth/runtime`
Expected: FAIL

- [ ] **Step 3: Implement `runtime.ts`, `index.ts`, the `public_api.ts` exports.**

- [ ] **Step 4: Run core test, lint, build, and the API report**

Run: `npx nx test core && npx nx lint core && npx nx build core && npx nx build-api-report core`
Expected: all PASS; `packages/core/core.api.md` gains the new `ɵ` exports and `DevelopmentCollectionDiagnostics`. Confirm no `#development-install` import leaks into `dist/packages/core/index.d.ts` (`grep -c development-install dist/packages/core/index.d.ts` → 0).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): development collector public internals"
```

---

### Task 9: React wiring

**Files:**
- Create: `packages/react/src/growth/collector.ts`
- Modify: `packages/react/src/hashbrown-provider.tsx`, `packages/react/src/hooks/use-chat.tsx`, `packages/react/src/hooks/use-structured-chat.tsx`, `packages/react/src/hooks/use-ui-chat.tsx`, `packages/react/src/hooks/use-ui-decision.tsx`, `packages/react/src/public-api.ts`, `packages/react/README.md` (API list of `HashbrownProvider` options)
- Test: `packages/react/src/growth/collector.spec.tsx`

**Interfaces:**
- `HashbrownProviderOptions.telemetry?: boolean` with TSDoc: "Set to `false` to turn off Hashbrown's development-only collection for every descendant hook. See https://hashbrown.dev/docs/react/platform/collection."
- `HashbrownProviderContext` gains `collector: ɵDevelopmentCollector` and `collectionEnabled: () => boolean`.
- `growth/collector.ts`:
  ```ts
  export function isDevelopmentBuild(): boolean;  // try { return process.env.NODE_ENV !== 'production' } catch { return false }
  export function createReactCollector(enabled: () => boolean): ɵDevelopmentCollector;  // ɵcreateDevelopmentCollector({ integration: 'react', packageName: '@hashbrownai/react', packageVersion: PACKAGE_VERSION, isDevelopment: isDevelopmentBuild, enabled })
  export function setDevelopmentCollectionEnabled(value: boolean): void;        // public re-export wrapper with TSDoc
  export function getDevelopmentCollectionDiagnostics(): DevelopmentCollectionDiagnostics;
  ```
- Provider: `const parent = useContext(HashbrownContext)`; `telemetryRef` updated each render; `collectionEnabled = useCallback(() => telemetryRef.current !== false && (parent?.collectionEnabled() ?? true), [parent])`; `collector = useMemo(() => createReactCollector(collectionEnabled), [collectionEnabled])`.
- `useChat` and `useStructuredChat`: alongside the `start()` effect, `useEffect(() => config.collector.attach(getRuntime()), [])`.
- `useUiChat`: `const config = useContext(HashbrownContext)`; `const renderedComponent = uiChatMessages.some(m => m.role === 'assistant' && Array.isArray(m.ui) && m.ui.length > 0)`; `useEffect(() => { if (renderedComponent && config) ɵreportMilestone(config.collector, 'component.first_rendered'); }, [renderedComponent, config])`.
- `useUiDecision`: `useEffect(() => { if (ids.length) ɵreportMilestone(config.collector, 'component.first_rendered'); }, [ids.length, config])` in both modes.
- `public-api.ts` exports `setDevelopmentCollectionEnabled`, `getDevelopmentCollectionDiagnostics`, `type DevelopmentCollectionDiagnostics` (re-exported from core).

- [ ] **Step 1: Write failing tests** (Jest + @testing-library/react as other react specs do; mock `@hashbrownai/core`'s `ɵcreateDevelopmentCollector` with `jest.mock` to capture options and attach calls)

```tsx
test('the provider creates one react collector and attaches it to each chat runtime', () => { /* render HashbrownProvider → useChat child; captured options.integration 'react', packageName '@hashbrownai/react', packageVersion PACKAGE_VERSION; attach called once with the runtime */ });
test('telemetry false disables collection and a nested provider cannot re-enable it', () => { /* outer telemetry false, inner telemetry true; inner collector options.enabled() === false */ });
test('isDevelopmentBuild is false when process is undefined', () => { /* delete globalThis.process in arrange, restore in finally */ });
test('rendering a component through useUiChat reports component.first_rendered once', () => { /* mock ɵreportMilestone; set messages with ui content → called once */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test react --testPathPattern=growth`
Expected: FAIL

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run react test, lint, build, API report, e2e (bundle budget)**

Run: `npx nx test react && npx nx lint react && npx nx build react && npx nx build-api-report react && npx nx e2e react`
Expected: PASS; `react.api.md` shows the two new functions and `telemetry?: boolean`; bundle budgets unchanged (renderer-only bundle does not import the provider).

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): development collection with a telemetry option"
```

---

### Task 10: Angular wiring

**Files:**
- Create: `packages/angular/src/growth/collector.ts`
- Modify: `packages/angular/src/providers/provide-hashbrown.fn.ts`, `packages/angular/src/resources/chat-resource.fn.ts`, `packages/angular/src/resources/structured-chat-resource.fn.ts`, `packages/angular/src/resources/completion-resource.fn.ts`, `packages/angular/src/components/render-message.component.ts`, `packages/angular/src/resources/ui-decision-resource.fn.ts`, `packages/angular/src/public_api.ts`
- Test: `packages/angular/src/growth/collector.spec.ts` (Vitest Angular, `TestBed`)

**Interfaces:**
- `ProvideHashbrownOptions.telemetry?: boolean` (same TSDoc as React, link `/docs/angular/platform/collection`).
- `growth/collector.ts`:
  ```ts
  export const ɵHASHBROWN_COLLECTION_ENABLED = new InjectionToken<() => boolean>('HashbrownCollectionEnabled');
  export function ɵprovideCollectionEnabled(options: ProvideHashbrownOptions): Provider;  // useFactory: parent = inject(token, { skipSelf: true, optional: true }); return () => (parent?.() ?? true) && options.telemetry !== false
  export function ɵinjectDevelopmentCollector(): ɵDevelopmentCollector;  // inject(token, { optional: true }) ?? (() => true); one collector per enabled function (WeakMap), created with integration 'angular', packageName '@hashbrownai/angular', packageVersion PACKAGE_VERSION, isDevelopment: isDevMode
  export function setDevelopmentCollectionEnabled(value: boolean): void;
  export function getDevelopmentCollectionDiagnostics(): DevelopmentCollectionDiagnostics;
  ```
- `provideHashbrown(options)` returns `[{ provide: ɵHASHBROWN_CONFIG_INJECTION_TOKEN, useValue: options }, ɵprovideCollectionEnabled(options)]` (return type stays `Provider`; Angular flattens arrays).
- Each of the three resources: `const collector = ɵinjectDevelopmentCollector();` before `createChatRuntime`; `const detach = collector.attach(runtime);` right after; `destroyRef.onDestroy` also calls `detach()`.
- `RenderMessageComponent`: `private readonly collector = ɵinjectDevelopmentCollector(); private reportedRender = false;` in `getRenderableComponent`, when returning the tag component (not the fallback), `if (!this.reportedRender) { this.reportedRender = true; ɵreportMilestone(this.collector, 'component.first_rendered'); }`.
- `uiDecisionResource`: `const collector = ɵinjectDevelopmentCollector(); effect(() => { if (ids().length) ɵreportMilestone(collector, 'component.first_rendered'); });` (both candidate and chat modes; destroy with the resource's existing cleanup).
- `public_api.ts` exports `setDevelopmentCollectionEnabled`, `getDevelopmentCollectionDiagnostics`, `type DevelopmentCollectionDiagnostics`.

- [ ] **Step 1: Write failing tests** (`vi.mock('@hashbrownai/core', async (importOriginal) => ({ ...(await importOriginal()), ɵcreateDevelopmentCollector: vi.fn(...) }))`)

```ts
test('provideHashbrown with telemetry false yields a disabled collector', () => { /* TestBed providers [provideHashbrown({ baseUrl: '/x', telemetry: false })]; runInInjectionContext(ɵinjectDevelopmentCollector) → captured options.enabled() false */ });
test('a child injector cannot re-enable a disabled parent', () => { /* parent injector telemetry false; child Injector.create with provideHashbrown({ telemetry: true }) → enabled() false */ });
test('without provideHashbrown the collector is enabled and uses isDevMode', () => { /* enabled() true; options.isDevelopment === isDevMode (or returns isDevMode()) */ });
test('chatResource attaches the collector and detaches on destroy', () => { /* attach spy called once; destroy TestBed → detach called */ });
test('rendering a component reports component.first_rendered once', () => { /* RenderMessageComponent with a ui message of one exposed component → ɵreportMilestone once */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx nx test angular --testPathPattern=growth` (or the vitest filter the executor accepts, e.g. `-- growth`)
Expected: FAIL

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run angular test, lint, build, API report, e2e**

Run: `npx nx test angular && npx nx lint angular && npx nx build angular && npx nx build-api-report angular && npx nx e2e angular`
Expected: PASS; `dist/packages/angular/package.json` has `scripts.postinstall` and `dist/packages/angular/install/` holds the seven `.cjs` files.

- [ ] **Step 5: Commit**

```bash
git add packages/angular
git commit -m "feat(angular): development collection with a telemetry option"
```

---

### Task 11: Pack verification e2e and conformance check

**Files:**
- Create: `tools/growth/install/verify-pack.mjs`, `tools/conformance/specs/collection.spec.ts`
- Modify: `tools/growth/project.json` (target `install-pack-e2e`: `nx:run-commands`, `cache: false`, `dependsOn: [{ projects: [the ten], target: 'build' }]`, command `node tools/growth/install/verify-pack.mjs`), `tools/conformance/README.md` (one line on the collection spec), `.github/workflows/pr-main.yml` only if `nx affected -t ... e2e` would not already pick up a target named `install-pack-e2e` — it won't; add `install-pack-e2e` to the affected target list on line 65.

**Interfaces:**
- `verify-pack.mjs` (node:assert, like threadplane's): starts a local `http.createServer` that records POST bodies and answers `200 { schemaVersion: 1, events: [...accepted] }`; for each of the ten dists: asserts dist manifest `scripts.postinstall === 'node install/postinstall.cjs'`, in-repo manifest has none, `npm pack --ignore-scripts --json` lists `install/{postinstall,collector,policy,git-context,identity,files,bridge}.cjs` and nothing else under `install/`, README contains `## What this package sends` and `DO_NOT_TRACK`; core tarball contains the five `development-install.*` files all null. Then scenarios `unknown`, `ci`, `disabled`, `ignore-scripts` in scratch dirs with `HOME` isolated, `HASHBROWN_TELEMETRY_ENDPOINT=http://127.0.0.1:<port>/_/growth/collect/v1/install`, `--foreground-scripts`: `unknown` → 10 events, one per package, one `installationToken` (on the core event only), core bridge files carry that token, subject ids equal, identity from the synthetic `.git/config`, no `secret` or repository name in any payload; `ci` → 10 events, `environment: 'ci'`, no identity, no token, core bridge null; `disabled` and `ignore-scripts` → 0 events and no `~/.hashbrown`. Then the stale-token `npm rebuild` check for core only. Prime a dependency cache first with `npm install --ignore-scripts --legacy-peer-deps` of the ten tarballs, then install `--offline`.
- `collection.spec.ts`: for both hosts (the fixture runs each spec per framework), record every request whose URL contains `/growth/collect/` from before navigation; open the `tool` scenario and complete a run with a tool call (reuse `tool-continuation.spec.ts` helpers), then open the `ui` scenario and complete a generative UI render (reuse `generative-ui.spec.ts` helpers); assert `collectRequests` is empty and `page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('hashbrown.growth')))` is `[]`. These hosts are production builds and Playwright sets `navigator.webdriver`, so this proves both gates.

- [ ] **Step 1: Write `collection.spec.ts` and run it against the current hosts** (it should pass already; it guards the gates)

Run: `npx nx conformance-e2e conformance -- --grep collection`
Expected: PASS for angular and react

- [ ] **Step 2: Write `verify-pack.mjs` and the target, build all ten packages, run it**

Run: `npx nx run-many -t build -p core react angular openai anthropic azure bedrock google ollama typesafe && npx nx install-pack-e2e growth`
Expected: prints one line per scenario and `All ten packed artifacts passed clean npm installation checks.`

- [ ] **Step 3: Run the conformance project checks and the react bundle budget**

Run: `npx nx build conformance && npx nx lint conformance && npx nx test conformance && npx nx e2e react`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tools/growth tools/conformance .github/workflows/pr-main.yml
git commit -m "test(growth): verify packed collectors and inert production hosts"
```

---

### Task 12: Disclosure: READMEs, docs page, privacy page

**Files:**
- Modify: `packages/{core,react,angular,openai,anthropic,azure,bedrock,google,ollama,typesafe}/README.md` (new `## What this package sends` section before `## Contributing`)
- Create: `www/content/docs/react/platform/collection.md`, `www/content/docs/angular/platform/collection.md`, `www/src/app/privacy/page.tsx`
- Modify: `www/src/components/menus/docs-menu.data.ts` (Platforms list gains `{ text: 'What Hashbrown Sends', path: 'platform/collection' }` after TypeSafe), `www/src/components/site/Footer.tsx` (a `Privacy` link to `/privacy` next to the Blog link), and whatever route inventory `npx nx test www` / `npx nx e2e www` requires for a new top-level page (check `www/test/element-inventory.spec.ts` and `www/src/lib/element-inventory.ts` output).

**Copy (fixed; adapt package names per README):**

Core, React, Angular READMEs:

```markdown
## What this package sends

Hashbrown sends two kinds of anonymous usage observations so we can see where
developers get stuck. Neither includes prompts, messages, schemas, tool
arguments, component props, URLs, or thread identifiers.

**When you install.** A postinstall step sends one `package.installed` event:
the package name and version, your operating system, CPU architecture, Node
version, package manager, whether the install ran in CI, and, when Git is
configured in the installing checkout or globally and the install is not in CI,
your Git `user.name`, `user.email`, and the owner of the `origin` remote on
GitHub, GitLab, or Bitbucket. It finishes within five seconds and never fails
an installation. `@hashbrownai/core` also writes a random installation id into
its own package folder so a development browser can cite the same install.

**While you develop.** In a development build in a browser, Hashbrown reports
when a chat runtime starts, the first completed stream, the first tool call,
and the first rendered component, once per session, with the package name and
version, the framework, and the transport kind. Production builds, server
rendering, and automated browsers send nothing.

Turn it off:

- `DO_NOT_TRACK=1` or `HASHBROWN_TELEMETRY_DISABLED=1` in the environment stops
  the install step. `HASHBROWN_TELEMETRY_DEBUG=1` prints what would be sent and
  sends nothing.
- `localStorage.setItem('HASHBROWN_TELEMETRY_DISABLED', '1')` or
  `window.__HASHBROWN_TELEMETRY_DISABLED__ = true` stops the browser collector.
- `<HashbrownProvider telemetry={false}>` (React) or
  `provideHashbrown({ telemetry: false })` (Angular) stops it for the app, and a
  nested provider cannot turn it back on.
- `setDevelopmentCollectionEnabled(false)` from `@hashbrownai/react` or
  `@hashbrownai/angular` before the first runtime is created.

Details, the full field list, and how to ask for deletion are at
[hashbrown.dev/docs/react/platform/collection](https://hashbrown.dev/docs/react/platform/collection)
and [hashbrown.dev/privacy](https://hashbrown.dev/privacy).
```

(Angular README links the angular docs path; core links both.) Provider READMEs (openai, anthropic, azure, bedrock, google, ollama, typesafe) get only the install paragraph, the first bullet, and the closing link paragraph.

Docs page (`collection.md`, both SDKs, frontmatter `title: 'What Hashbrown Sends: Hashbrown React Docs'` / `Angular`, description `'The anonymous usage observations Hashbrown sends, and every way to turn them off.'`): sections `# What Hashbrown Sends`, `## When you install`, `## While you develop` (the four events as a table: event, when, fields), `## Turning it off` (the opt-outs with code blocks for the SDK), `## Where it goes` (`https://hashbrown.dev/_/growth/collect/v1/...`, stored by Hashbrown, processors named Vercel and Neon, retained until you ask), `## Deleting your data` (email `brian@hashbrown.dev`, what is deleted and what remains: a one-way hash of the email so we do not contact you again). Angular copy uses `provideHashbrown({ telemetry: false })` and `setDevelopmentCollectionEnabled` from `@hashbrownai/angular`.

`/privacy` page (`pageMetadata({ title: 'Privacy: Hashbrown', description: 'What Hashbrown collects, who processes it, and how to opt out or ask for deletion.' })`), sections in plain prose: What we collect (website visits and page views on hashbrown.dev; install and development observations from the packages; the Get unstuck form and email replies), Who processes it (Vercel hosting; Neon database; PostHog product analytics; Resend email; Google Workspace mailbox), How long we keep it (indefinitely by default), Email (one short founder sequence to people who opt in through the form or the install digest; every email has an unsubscribe link; replies go to a human), Your choices (every opt-out, same list), Deletion (email `brian@hashbrown.dev`; we null contact fields, remove the project mapping, cancel scheduled email, and redact observations; a one-way hash of the address and the stop record remain so we never contact you again), Contact. Style with the existing docs prose classes (`docs.module.css`) so it matches a docs page.

- [ ] **Step 1: Write the ten README sections, the two docs pages, the menu entry, the privacy page, and the footer link.**

- [ ] **Step 2: Run the www checks**

Run: `npx nx test www && npx nx lint www && npx nx build www`
Expected: PASS. If `content.spec.ts` or the element inventory asserts a page count or a route list, update that assertion for the two docs pages and `/privacy` and say so in the commit body.

- [ ] **Step 3: Grep the public copy for the forbidden word**

Run: `grep -rin "tracking" packages/*/README.md www/content/docs/*/platform/collection.md www/src/app/privacy/page.tsx | grep -v DO_NOT_TRACK`
Expected: no output

- [ ] **Step 4: Rebuild the ten packages and rerun the pack check (README assertion)**

Run: `npx nx run-many -t build -p core react angular openai anthropic azure bedrock google ollama typesafe && npx nx install-pack-e2e growth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/*/README.md www
git commit -m "docs: disclose what Hashbrown sends and add the privacy page"
```

---

### Task 13: Full verification and local end-to-end

**Files:** none new (fixes only, if a check fails).

- [ ] **Step 1: Run every affected project's build, test, lint**

Run: `npx nx run-many -t build,test,lint -p core react angular openai anthropic azure bedrock google ollama typesafe growth conformance www`
Expected: all PASS. Then `npx nx run-many -t e2e -p core react angular` and `npx nx conformance-e2e conformance`.

- [ ] **Step 2: Inspect one tarball per build kind by hand**

Run: `cd dist/packages/core && npm pack --ignore-scripts --dry-run 2>&1 | grep -E "install/|development-install|postinstall"`; repeat for `react`, `angular`, `openai`.
Expected: the seven `install/*.cjs`, and for core the five `development-install.*` files.

- [ ] **Step 3: Local end-to-end against the PR 2 route**

Start `npx nx serve www` (needs the growth preview `DATABASE_URL`, `GROWTH_DATABASE_ENVIRONMENT`, and the HMAC key env the collection route reads; see `docs/superpowers/runbooks/` from PR 2 for the names). Then:

- Install: `mkdir /tmp/hb-e2e && cd /tmp/hb-e2e && git init -q && git config user.email dev@example.com && git config user.name Dev && npm init -y >/dev/null && HASHBROWN_TELEMETRY_ENDPOINT=http://127.0.0.1:3000/_/growth/collect/v1/install npm install --foreground-scripts <path to core tarball>` → the www dev log shows a `200` for `POST /_/growth/collect/v1/install`; `npx nx report growth -- journeys` (or the PR 2 report command) shows the install.
- Runtime: serve `runtime-smoke-react` in development mode (`npx nx serve runtime-smoke-react` or `vite` in `tools/conformance/hosts/react` with `--mode development`), open it in a real browser (not Playwright) with `?runUrl=` pointing at a running aimock or the atc server, send a message, and watch a `POST http://localhost:3000/...` is not possible without an override, so instead use the browser devtools to confirm the POST to `https://hashbrown.dev/_/growth/collect/v1/runtime` fires once with `runtime.session_started` and the milestones, and copy one request body into `curl -X POST http://127.0.0.1:3000/_/growth/collect/v1/runtime -H 'content-type: application/json' --data @body.json` → `200` with `accepted` dispositions.

Record what was verified in the PR description. If the database env is not available locally, say so explicitly and show the curl against the running route with a hand-built batch instead.

- [ ] **Step 4: Commit any fixes, push, open the PR against `blove/growth-observation-intake`**

```bash
git push -u origin blove/growth-collectors
gh pr create --base blove/growth-observation-intake --title "feat(growth): install and development collectors" --body-file <summary with the verification evidence; end with the attribution line>
```
