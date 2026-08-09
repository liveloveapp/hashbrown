# Angular 22 and Nx 23 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Hashbrown to Angular 22 and Nx 23 with compatible ecosystem
dependencies, a reproducible npm tree, extensive validation, and no change to
npm publishing behavior.

**Architecture:** Perform the migration in two independently validated major
version checkpoints. First normalize the workspace on Nx 22 and Angular 21,
introducing the Analog/Marked compatibility bridge. Then migrate to Nx 23 and
Angular 22, pin the approved prereleases, and enforce clean dependency trees in
CI. Treat generated migrations as configuration changes; use test-first work
for workflow and manual source behavior changes.

**Tech Stack:** Node.js 24.18.0, npm 11, Nx, Angular, Analog, NgRx, Vite,
Vitest, Jest, ESLint, GitHub Actions, Cloudflare Workers

---

## File Map

- `package.json`: root dependency compatibility set.
- `package-lock.json`: reproducible npm 11 dependency tree.
- `migrations.json`: temporary Nx migration manifest; inspect and remove after
  each checkpoint.
- `nx.json`: Nx migration output and workspace defaults if required.
- `tsconfig.base.json`: TypeScript migration output if required.
- `eslint.config.mjs`: root lint migration output if required.
- `packages/**`, `samples/**`, `www/analog/**`: retain only source/config edits
  produced by official migrations or required compatibility fixes.
- `.github/workflows/pr-main.yml`: enforce `npm ls --all` after installation.
- `tools/cloudflare/workflow.test.mjs`: regression test for dependency-tree CI
  ordering.
- `docs/security/dependency-audit-2026-08-07.md`: post-migration audit and
  dependency-tree record.
- `docs/superpowers/specs/2026-08-07-angular-22-nx-23-migration-design.md`:
  approved design.

## Selected Versions

Confirm these versions with `npm view` immediately before changing the
manifest. Use these versions unless a newer patch in the same selected line is
available and has compatible peers.

| Package set                 | Stage 1                       | Stage 2/final                  |
| --------------------------- | ----------------------------- | ------------------------------ |
| Nx and all `@nx/*` packages | `22.7.8`                      | `23.1.1`                       |
| Angular framework           | `21.2.19`                     | `22.1.1`                       |
| Angular build/devkit        | `21.2.20`                     | `22.1.3`                       |
| Angular Material/CDK        | `21.2.14`                     | `22.1.1`                       |
| TypeScript                  | `5.9.3`                       | `6.0.3`                        |
| Angular ESLint scoped set   | `21.4.0`                      | `22.1.0`                       |
| NgRx                        | `21.1.1`                      | exact `22.0.0-rc.0`            |
| Analog first-party set      | exact `3.0.0-alpha.64`        | exact `3.0.0-alpha.64`         |
| ngx-markdown                | `21.3.0`                      | `22.0.0`                       |
| Marked                      | `18.0.9`                      | `18.0.9`                       |
| Vite / Vitest               | `7.3.6` / `4.1.10`            | `8.2.1` / `4.1.10`             |
| `@vitejs/plugin-react`      | existing compatible patch     | `6.0.5`                        |
| Zone.js                     | `0.16.2`                      | `0.16.2`                       |
| SWC CLI/register/core       | `0.8.1` / `1.12.1` / `1.15.8` | `0.8.1` / `1.12.1` / `1.15.47` |
| Jiti / LRU Cache            | `2.7.0` / `11.2.6`            | `2.7.0` / `11.2.6`             |
| Storybook / React Vite      | `10.5.7` / `10.5.7`           | `10.5.7` / `10.5.7`            |

Do not retain `@angular/cli` in the final manifest, use `--force` or
`legacy-peer-deps`, add npm overrides, publish packages, or retain an invalid
peer tree. A matching Angular CLI and `angular-eslint` meta-package are allowed
only as temporary migration providers and must be removed before final
dependency-tree validation.

### Task 1: Add the CI Dependency-Tree Guardrail

**Files:**

- Modify: `tools/cloudflare/workflow.test.mjs`
- Modify: `.github/workflows/pr-main.yml`

- [ ] **Step 1: Write the failing workflow test**

Add a top-level `test(...)` asserting that the `ci` job contains a named
dependency-tree step whose command is exactly `npm ls --all`, that it appears
after `run: npm ci`, and that it appears before the Cloudflare tooling and Nx
workspace validation steps. Use string indexes or a narrowly scoped regular
expression against the `ci` job; do not introduce a YAML parser dependency.

- [ ] **Step 2: Verify the test fails for the missing guardrail**

Run:

```sh
source "$HOME/.nvm/nvm.sh" && nvm use
npx nx test cloudflare-deployment
```

Expected: the new test fails because `.github/workflows/pr-main.yml` has no
`npm ls --all` step.

- [ ] **Step 3: Add the workflow step**

Immediately after `Install dependencies` in the `ci` job, add:

```yaml
- name: Validate dependency tree
  run: npm ls --all
```

Do not add the step to preview, production, or npm publishing jobs; the `ci`
job gates both preview and production.

- [ ] **Step 4: Verify the workflow test and syntax**

Run:

```sh
npx nx test cloudflare-deployment
actionlint .github/workflows/pr-main.yml
```

Expected: all Cloudflare deployment tests and actionlint pass.

- [ ] **Step 5: Commit the guardrail**

```sh
git add .github/workflows/pr-main.yml tools/cloudflare/workflow.test.mjs
git commit -m "ci: validate the npm dependency tree"
```

### Task 2: Migrate to Nx 22 and Angular 21

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify if generated: `nx.json`
- Modify if generated: `tsconfig.base.json`
- Modify if generated: workspace source and configuration files listed by
  `migrations.json`
- Delete after execution: `migrations.json`

- [ ] **Step 1: Reconfirm Stage 1 package versions**

Run `npm view` for Nx 22, Angular 21 framework/build/Material, Angular ESLint
21, NgRx 21, ngx-markdown 21, TypeScript 5.9, Analog alpha, Marked 18, Vitest,
SWC, Jiti, LRU Cache, and Storybook. Record any newer patch chosen in the commit
message body and audit document.

- [ ] **Step 2: Generate the Nx 22 migration**

Run:

```sh
npx nx migrate 22.7.8 --interactive=false
```

Review `package.json` and every entry in `migrations.json`. Confirm all
first-party `@nx/*` packages and `nx` resolve to the same 22.7.8 version. Do not
run migrations if the manifest still mixes Nx majors.

- [ ] **Step 3: Complete the Angular 21 compatibility manifest**

Align existing Angular framework packages at 21.2.19, build/devkit packages at
21.2.20, and Material/CDK at 21.2.14. Align all installed first-party Nx
packages at 22.7.8. Set TypeScript 5.9.3, Zone.js 0.16.2, Angular ESLint scoped
packages 21.4.0, NgRx packages 21.1.1, and ngx-markdown 21.3.0.

Pin these existing first-party Analog dependencies exactly to
`3.0.0-alpha.64`: `@analogjs/content`, `@analogjs/platform`,
`@analogjs/router`, `@analogjs/vite-plugin-angular`, and
`@analogjs/vitest-angular`. Set Marked to 18.0.9 and retain compatible Marked
plugins. Keep Vite 7.3.6 and align Vitest, `@vitest/coverage-v8`, and
`@vitest/ui` at 4.1.10 because Angular build 21 requires Vitest 4. Align
`@swc/cli` at 0.8.1 for Chokidar 5 compatibility, `jiti` at 2.7.0, and
`lru-cache` at 11.2.6 for the pinned Analog peer tree. Align Storybook and the
declared `@storybook/react-vite` framework at 10.5.7.

Remove `@angular-architects/ngrx-toolkit` and `ngrx-toolkit` only after a fresh
repository search reconfirms they have no source/config imports. Retain and
align the `angular-eslint` meta-package at 21.4.0 for migration discovery, and
add the matching `@angular/cli` 21.2.20 peer as temporary migration tooling.
Retain `@angular-eslint/eslint-plugin`,
`@angular-eslint/eslint-plugin-template`, and
`@angular-eslint/template-parser`. The meta-package and CLI remain through the
Stage 1 checkpoint so the Stage 2 migrator can discover their next-major
migrations; neither may remain in the final manifest.

Complete these `package.json` edits before installing dependencies. The
Angular 20-era ngx-markdown and Angular ESLint peers cannot be installed beside
Angular 21 by npm 11.

- [ ] **Step 4: Install migration tooling and run official migrations**

Run:

```sh
npm install
npx nx migrate --run-migrations
```

Review every generated source/config change. Remove `migrations.json` only
after all entries complete. Do not hand-edit generated behavior unless a
focused failing test demonstrates the compatibility requirement.

- [ ] **Step 5: Regenerate and validate the Stage 1 install**

Run with Node.js 24 and npm 11:

```sh
npm install
npm ci
npm ls --all
npx nx sync:check
```

Expected: all commands exit zero, with no invalid or extraneous packages. If
the tree is invalid, stop and resolve the peer conflict without suppressions.

- [ ] **Step 6: Run the complete Stage 1 workspace checkpoint**

Run:

```sh
npx nx run-many -t lint,test,build,e2e --parallel=3 --outputStyle=static
npx nx run-many -t typecheck --parallel=3 --outputStyle=static
npx nx eslint:lint smart-home-react --outputStyle=static
npx nx build-storybook smart-home-react --outputStyle=static
npx nx build-api-report angular --outputStyle=static
```

Expected: every available target passes. Restore only tracked generated data
or metadata files changed as a side effect of successful targets. Never discard
migration source/config changes merely because they are broad.

The workspace intentionally has no root `tsconfig.json`, so retain Nx's
recommended `sync.disabledTaskSyncGenerators` entry for
`@nx/js:typescript-sync`. The pre-existing inferred `tsc:typecheck` target
assumes Nx's full project-reference architecture and is not a migration gate;
the explicit `typecheck` targets and package builds remain required.

- [ ] **Step 7: Commit the Stage 1 checkpoint**

Inspect `git diff --check`, migration output, and the complete changed-file
list. Commit only the coherent Nx 22/Angular 21 checkpoint:

```sh
git add package.json package-lock.json nx.json tsconfig.base.json eslint.config.mjs .gitignore packages samples www
git commit -m "build: migrate to Angular 21 and Nx 22"
```

Adjust the staged path list to include only files actually changed by the
migration.

### Task 3: Migrate to Nx 23 and Angular 22

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify if generated: `nx.json`
- Modify if generated: `tsconfig.base.json`
- Modify if generated: workspace source and configuration files listed by
  `migrations.json`
- Delete after execution: `migrations.json`

- [ ] **Step 1: Generate and inspect the Nx 23 migration**

Run:

```sh
npx nx migrate 23.1.1 --interactive=false
```

Confirm `nx` and every first-party `@nx/*` package are aligned at 23.1.1 and
that Angular 22 migrations are represented. Review migration requirements for
removed Nx APIs before execution.

- [ ] **Step 2: Complete the Angular 22 compatibility manifest**

Align Angular framework packages at 22.1.1, build/devkit packages at 22.1.3,
Material/CDK at 22.1.1, ng-packagr at 22.1.1, TypeScript at 6.0.3, Zone.js at
0.16.2, and all Angular ESLint packages at 22.1.0. Retain the migration-updated
`angular-eslint` meta-package and matching `@angular/cli` 22.1.3 until official
migrations finish.

Keep all first-party Analog packages exactly at `3.0.0-alpha.64` and Marked at
18.0.9. Update ngx-markdown to 22.0.0. Pin all installed NgRx packages exactly
to `22.0.0-rc.0`.

Update Vite to 8.2.1, Vitest and its installed first-party companion packages
to 4.1.10, and `@vitejs/plugin-react` to 6.0.5. Align SWC with Nx 23 peer
requirements, preferring `@swc-node/register` 1.12.1 and `@swc/core` 1.15.47;
keep `@swc/cli` within Nx 23's supported `<0.9.0` range.

Complete these `package.json` edits before installing dependencies. The
Angular 21-era NgRx and ngx-markdown peers cannot be installed beside Angular
22 by npm 11.

- [ ] **Step 3: Install migration tooling and run official migrations**

Run:

```sh
npm install
npx nx migrate --run-migrations
```

Review every generated change. Remove `migrations.json` only after all entries
complete successfully.

After migrations complete, remove `angular-eslint` and `@angular/cli`, run
`npm install` again to regenerate the lockfile, and confirm the scoped Angular
ESLint plugin/parser packages remain at 22.1.0. No final manifest or lockfile
entry may depend on the migration-only meta-package or CLI.

- [ ] **Step 4: Verify manual source compatibility fixes test-first**

Run the most focused existing test/build for each source file that fails after
official migrations. Before changing runtime behavior, add or adjust a focused
top-level `test(...)`, verify the expected failure, make the minimal source
change, and verify the focused test passes. Configuration-only or generated
migration edits are exempt from test-first ordering but must pass their owning
target.

- [ ] **Step 5: Regenerate and validate the final install**

Run:

```sh
npm install
npm ci
npm ls --all
npx nx sync:check
```

Expected: every command exits zero; no invalid, extraneous, or conflicting peer
dependencies remain.

- [ ] **Step 6: Run the complete Stage 2 workspace checkpoint**

Run:

```sh
npx nx run-many -t lint,test,build,e2e --parallel=3 --outputStyle=static
```

Investigate every new warning attributable to the migration. Restore only
tracked generated outputs changed as target side effects.

- [ ] **Step 7: Commit the Stage 2 checkpoint**

After `git diff --check` and a complete diff review:

```sh
git add package.json package-lock.json nx.json tsconfig.base.json eslint.config.mjs .gitignore packages samples www
git commit -m "build: migrate to Angular 22 and Nx 23"
```

Adjust the path list to the actual migration output.

### Task 4: Record Security and Compatibility Results

**Files:**

- Modify: `docs/security/dependency-audit-2026-08-07.md`

- [ ] **Step 1: Capture audit reports without mutating dependencies**

Run:

```sh
npm audit --json > /tmp/hashbrown-angular22-audit-full.json || true
npm audit --omit=dev --json > /tmp/hashbrown-angular22-audit-production.json || true
```

Extract totals and dependency paths. Compare against the committed baseline,
recognizing that advisory data may have changed independently of the lockfile.

- [ ] **Step 2: Update the audit record**

Document:

- exact Node/npm versions;
- selected Angular, Nx, Analog, and NgRx versions;
- successful clean `npm ci` and `npm ls --all` results;
- resolved Nx/SWC peer failures;
- full and production audit totals;
- every advisory introduced or removed on a changed dependency path;
- temporary Analog/NgRx pins and stable-release follow-ups;
- remaining remediation order.

Do not claim the migration fixes unrelated advisories. An unexplained new
critical finding or changed-path runtime advisory blocks progress.

- [ ] **Step 3: Verify and commit the audit record**

Run:

```sh
npx prettier --check docs/security/dependency-audit-2026-08-07.md
git diff --check
```

Then commit:

```sh
git add docs/security/dependency-audit-2026-08-07.md
git commit -m "docs: update dependency audit after Angular migration"
```

### Task 5: Run the Exhaustive Local Release Gate

**Files:**

- Modify only if a verified migration regression requires a focused fix and
  test.

- [ ] **Step 1: Verify repository and runtime state**

Run:

```sh
git status --short
source "$HOME/.nvm/nvm.sh" && nvm use
node --version
npm --version
npm ci
npm ls --all
npx nx sync:check
```

Expected: Node 24.18.0, npm 11, clean install, valid dependency tree, and no Nx
sync drift.

- [ ] **Step 2: Run all standard workspace targets**

```sh
npx nx run-many -t lint,test,build,e2e --parallel=3 --outputStyle=static
```

Expected: every available target succeeds.

- [ ] **Step 3: Run published-package validation**

```sh
npx nx run-many -t build-api-report -p core react angular openai anthropic azure bedrock google ollama writer --parallel=3
npx nx parser-test-client core
npx nx parser-test-server core
npx nx run-many -t build -p angular anthropic azure bedrock core google ollama openai react writer --parallel=3
node scripts/verify-release-versions.mjs
```

Expected: API reports, parser compatibility, release builds, and atomic release
metadata checks pass without publishing.

- [ ] **Step 4: Run deployment and formatting validation**

```sh
npx nx lint cloudflare-deployment
npx nx test cloudflare-deployment
actionlint
git diff --name-only --diff-filter=ACMR -z origin/main...HEAD | xargs -0 npx prettier --check --ignore-unknown
git diff --check
```

Expected: all commands pass. Confirm `.github/workflows/npm-publish.yml`
remains tag-triggered, OIDC-enabled, and independent of Cloudflare deployment.

- [ ] **Step 5: Review all generated side effects and final diff**

Restore only tracked generated data/build metadata created by validation. Run
`git status --short`, `git diff --stat origin/main...HEAD`, and inspect every
changed file. Commit focused fixes with their tests; do not fold unexplained
generated changes into the migration.

- [ ] **Step 6: Request independent final code review**

Dispatch a fresh review subagent with the spec, plan, full branch diff, audit
record, and exact validation results. Resolve correctness, compatibility,
security, or missing-test findings and rerun the affected plus full local
gates. Advisory style-only feedback does not block the PR.

### Task 6: Open, Validate, and Merge the Pull Request

**Files:** None unless CI exposes a verified regression.

- [ ] **Step 1: Synchronize with main and rerun affected validation**

Fetch `origin/main`. If main advanced, rebase the branch non-interactively,
resolve conflicts without dropping migration changes, run `npm ci`,
`npm ls --all`, and the full exhaustive local release gate again.

- [ ] **Step 2: Push and open a ready pull request**

Push `blove/angular-22-nx-23` and open a non-draft PR summarizing:

- staged Angular/Nx migrations;
- exact NgRx and Analog prerelease pins;
- dependency-tree repair and CI guardrail;
- audit delta;
- local validation evidence;
- explicit statement that npm publishing is unchanged.

- [ ] **Step 3: Monitor required PR validation**

Wait for `Lint, Test, Build`, `Cloudflare Preview`, and `PR Gate`. Do not merge
while any required check is pending or failing. Address CI failures with
systematic debugging, focused tests, and renewed local validation.

- [ ] **Step 4: Smoke-test the website preview**

Using the preview URL posted to the PR, run automated browser checks without
adding a repository dependency:

- `/`: title contains `Hashbrown: The TypeScript Framework for Generative UI`
  and visible primary content renders.
- `/docs/angular/start/quick`: visible `Angular Quick Start` heading and code
  examples render.
- `/blog/2026-07-09-hashbrown-v-0-5-0`: the v0.5 title and release body render.

Check browser console errors and failed document/script/style requests. Record
the preview URL and results in the PR.

- [ ] **Step 5: Squash-merge only when green**

Confirm the PR is mergeable and required status checks are successful, then
squash-merge. Do not bypass the ruleset.

- [ ] **Step 6: Monitor main and production**

Verify the resulting main workflow completes successfully. Confirm the Actions
summary reports successful builds and deployments for `hashbrown-www`,
`hashbrown-finance`, `hashbrown-fast-food`, and `hashbrown-smart-home`. If the
main push run is absent, use `workflow_dispatch` on main. Diagnose and correct
or revert any production failure.

- [ ] **Step 7: Verify release independence and clean up**

Confirm no npm publish workflow ran, npm publishing remains tag-triggered, and
the main ruleset still requires `PR Gate`. Delete the remote feature branch and
remove the migration worktree only after production succeeds and all retained
work is on main.
