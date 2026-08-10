# Angular 22 and Nx 23 Migration Design

## Summary

Migrate the Hashbrown monorepo from Angular 20 to Angular 22 and from a mixed
Nx 21/22 toolchain to Nx 23. The migration will move through each intervening
major version, apply official migrations at each stage, align the Angular and
Nx ecosystems, and leave the repository with a reproducible dependency tree.

NgRx 22 and the Analog 3 line are not yet stable. The migration will pin all
NgRx packages to `22.0.0-rc.0` and all first-party Analog packages to
`3.0.0-alpha.64`. Analog 3's split Vite integration also requires an explicit
Nitro plugin, so Nitro will be pinned to `3.0.260522-beta` until follow-ups
replace these prerelease pins with stable releases. Nitro's H3 dependency will
also be held to `2.0.1-rc.26` with a root override so lockfile regeneration
cannot move the server API beneath the Docs app.

## Context

The root manifest currently mixes Nx 21.5 and 21.6 packages with
`@nx/vite` 22.7.6. With Node.js 24 and npm 11, a fresh `npm ci` succeeds but
`npm ls --all` fails because the Nx 22 subtree requires newer `@nx/eslint`,
`@swc-node/register`, and `@swc/core` packages than the root provides.

The baseline workspace remains behaviorally healthy: a full run of every
available `lint`, `test`, `build`, and `e2e` target succeeds. The migration must
preserve that behavior while fixing the invalid dependency tree.

Angular 22 requires TypeScript 6.0 and a supported Node.js release. The
repository already declares Node.js 24.18.0, which satisfies Angular 22 and Nx 23. Stable Analog 2.6.4 supports Angular 22, Nx 23, and Vite 8 but requires
Marked 15, while ngx-markdown 22 requires Marked 17 or 18. Analog
`3.0.0-alpha.64` supports Marked 18 and resolves that otherwise disjoint peer
range without an npm override. Angular ESLint and ngx-markdown provide Angular
22-compatible releases. The installed `@angular-architects/ngrx-toolkit` and
`ngrx-toolkit` packages have no source imports in the repository and will be
removed instead of carrying incompatible or deprecated packages forward. The
`angular-eslint` meta-package also has no direct import and requires an
otherwise-unused Angular CLI peer, so it will be removed while the scoped
`@angular-eslint/*` packages remain.

## Goals

- Update Angular framework, build, SSR, Material, and CDK packages to the
  latest compatible Angular 22 patch releases.
- Update `nx` and every first-party `@nx/*` package to the same Nx 23 patch
  release.
- Apply Angular and Nx migrations one major version at a time.
- Align TypeScript, Angular ESLint, Analog, Vite, Vitest, ngx-markdown, NgRx,
  SWC, and other packages required by the migration.
- Pin every NgRx package to exactly `22.0.0-rc.0`.
- Pin every first-party Analog package to exactly `3.0.0-alpha.64`.
- Pin Nitro to exactly `3.0.260522-beta` and configure its Cloudflare Pages
  Vite plugin explicitly.
- Override H3 to exactly `2.0.1-rc.26` at the install root.
- Load Nitro's generated Wrangler deployment configuration and upload its
  multi-module worker without an additional Wrangler bundling pass.
- Remove unused NgRx toolkit packages that do not support Angular 22.
- Remove the unused `angular-eslint` meta-package without removing the scoped
  lint plugins and parser used by Nx and workspace lint configuration.
- Produce a fresh install for which `npm ls --all` exits successfully.
- Record and classify the full and production npm audit baselines after the
  migration without accepting an invalid dependency tree or a new advisory on
  a changed dependency path without review.
- Add dependency-tree validation to pull request and main CI.
- Exercise every build, lint, test, e2e, API report, parser, and deployment
  validation surface affected by the migration.

## Non-Goals

- Publish npm packages or change npm release triggers, permissions, tags, or
  trusted-publishing configuration.
- Adopt optional Angular or Nx architecture changes that are not required by
  official migrations.
- Upgrade unrelated application dependencies solely because a newer major is
  available.
- Add an npm audit failure threshold before the remaining findings have been
  reviewed and intentionally remediated.
- Deploy from a local machine or bypass the existing PR and main workflows.

## Migration Strategy

### Stage 1: Normalize on Nx 22 and Angular 21

Start from a clean worktree based on `origin/main`. Use the official Nx migrate
command to align `nx` and all first-party `@nx/*` packages at the latest Nx 22
patch. Apply the generated Nx migrations.

Then migrate Angular and its first-party ecosystem from 20 to the latest
Angular 21 patch, including Material and CDK. Apply the generated Angular
migrations through Nx. Align TypeScript and Angular ecosystem peers to the
versions required by Angular 21.

Introduce the cross-major compatibility bridge at this checkpoint: pin all
first-party Analog packages to `3.0.0-alpha.64`, update Marked to 18.x, and use
ngx-markdown 21.x. Analog 3 supports Angular 21 and Marked 18, while
ngx-markdown 21 supports Angular 21 and Marked 17 or 18. This ordering makes the
Stage 1 peer tree valid before Angular advances to 22.

Angular 21's build tooling requires Vitest 4, so align Vitest and its installed
companions at 4.1.10 during this stage while retaining Vite 7.3.6. Align the
existing SWC CLI with Chokidar 5, and satisfy Analog's pinned Nitro/Unstorage
optional peers with exact Jiti and LRU Cache versions. Storybook's Nx 22
migration must retain a declared `@storybook/react-vite` framework package and
must pass its inferred lint and static-build targets.

The stage is complete only when a clean install succeeds, the dependency tree
is valid, and the complete workspace validation suite passes, including the
Angular API report and Storybook-specific lint and static-build targets. This
checkpoint ensures Angular 21 migrations are not skipped or conflated with
Angular 22 changes.

### Stage 2: Move to Nx 23 and Angular 22

Use the Nx migrator again to move the entire Nx package set from 22 to the
latest Nx 23 patch, and apply all required migrations. Then migrate Angular 21
to the latest Angular 22 patch and apply the Angular 22 migrations.

Align the ecosystem to Angular 22. The selected versions as of 2026-08-07 are
Nx 23.1.1, Angular framework 22.1.1, Angular build tooling 22.1.3, and Angular
Material/CDK 22.1.1. Planning will confirm these exact versions have not been
superseded before the first package change. Do not retain `@angular/cli` in the
final manifest; it is not currently needed by the workspace. A matching Angular
CLI and `angular-eslint` meta-package may be installed only as temporary
migration tooling so the Angular ESLint migrations can run, and both must be
removed before final dependency-tree validation.

The compatibility set includes:

- TypeScript 6.0.x
- Angular Devkit, schematics, build, SSR, Material, CDK, and ng-packagr 22.x
- Scoped Angular ESLint packages 22.x, without the `angular-eslint`
  meta-package
- Analog Content, Platform, Router, Vite Plugin Angular, and Vitest Angular
  remain pinned exactly to `3.0.0-alpha.64`
- Nitro remains pinned exactly to `3.0.260522-beta` and owns generation of the
  Cloudflare Pages worker bundle
- H3 remains pinned exactly to `2.0.1-rc.26` through the root install override
- Vite 8.x and Vitest 4.x
- `@vitejs/plugin-react` 6.x for Vite 8 compatibility
- ngx-markdown 22.x and Marked 18.x, with compatible Marked plugins
- NgRx Store, Effects, Entity, Signals, and Store Devtools exactly
  `22.0.0-rc.0`
- SWC packages compatible with the selected Nx 23 release

Narrow the published `@hashbrownai/angular` peers to Angular 22. Angular 22's
partial compiler emits the `ChangeDetectionStrategy.Eager` member added in
Angular 21.2, and an Angular 20 final-artifact consumer build confirms that an
older linker rejects that metadata. Advertising Angular 20 or early Angular 21
compatibility would therefore be incorrect.

Remove `@angular-architects/ngrx-toolkit`, `ngrx-toolkit`, and the
`angular-eslint` meta-package after confirming again that no source or
configuration imports them. Retain the scoped Angular ESLint plugin and parser
packages used by Nx and the workspace lint configuration. Regenerate the
lockfile with Node.js 24 and npm 11 without `--force`, `legacy-peer-deps`,
overrides, or dependency downgrades.

### Stage 3: CI Guardrail and Audit Record

Add `npm ls --all` immediately after `npm ci` in the `ci` job of
`.github/workflows/pr-main.yml`. This makes an invalid peer tree a required
validation failure before builds or deployments proceed. Update
`tools/cloudflare/workflow.test.mjs` so this step cannot be removed or moved
after workspace validation accidentally. The affected-project gate runs the
standard lint, test, typecheck, build, and e2e targets. A separate CI step runs
the smart-home React sample's inferred ESLint and Storybook targets, whose names
are not covered by the standard target set.

Record full and production npm audit totals after migration and compare them
with the pre-migration baseline. Audit totals are diagnostic rather than a
numeric merge gate because npm advisory data can change independently of the
lockfile. Every advisory introduced on a dependency path changed by this
migration must be classified before merge. An unexplained new critical finding
or a new finding reachable in a deployed runtime blocks merge. Remaining
accepted findings will be classified for a follow-up security PR. A lower total
does not compensate for a failed dependency-tree check.

## Testing Strategy

Validation runs under the repository's declared Node.js 24 release and npm 11.
Each major-version checkpoint runs:

1. `npm ci`
2. `npm ls --all`
3. `npx nx sync:check`
4. Every available `lint`, `test`, `build`, and `e2e` target across the
   workspace
5. Every available inferred `typecheck` target, plus the smart-home React
   sample's inferred ESLint and Storybook targets that use nonstandard names

After the final migration, also run:

- API report builds for all published packages that define the target
- The Core Skillet streaming JSON parser Jest suite. The obsolete socket client
  and server harness targets, whose sources were removed before this migration,
  are retired.
- The Core pack-and-consume e2e test for generated chunks and ESM/CJS entrypoints
- The Angular final-artifact e2e check that enforces the Angular 22 peer boundary
  required by its `Eager` change-detection metadata
- The Docs final-artifact e2e check that requires the Cloudflare worker entry
  point, rendered site entry page, generated Wrangler redirect, and Node.js
  compatibility flag
- Cloudflare workflow tests and actionlint
- Formatting checks for every changed file
- Full and production npm audits
- `npx nx run-many -t build -p angular anthropic azure bedrock core google
ollama openai react writer --parallel=3`
- `node scripts/verify-release-versions.mjs`
- The PR workflow, including affected validation and Cloudflare previews
- Automated browser smoke tests against the `www` preview, run from the
  operator environment without adding a project dependency. Verify `/` renders
  the Hashbrown generative UI title, `/docs/angular/start/quick` renders
  "Angular Quick Start" and its code examples, and
  `/blog/2026-07-09-hashbrown-v-0-5-0` renders the v0.5 release title and body.
  These checks are required because the production website moves to an Analog
  alpha release.
- The main workflow and all four Cloudflare production deployments after merge

Existing baseline warnings may remain if they are unrelated to the migration,
but new errors, invalid peers, migration warnings, or unexplained build warnings
must be investigated before merge.

## Failure Handling

- Stop at the current major-version checkpoint when install, migration, or
  validation fails. Do not continue to the next major with a broken workspace.
- Resolve peer conflicts by selecting compatible published versions or removing
  unused packages. Do not suppress npm's resolver.
- Review every generated migration change. Retain only changes required for the
  supported Angular/Nx upgrade path.
- Add focused regression tests before manual compatibility fixes that change
  source behavior.
- Keep generated build outputs and migration scratch files out of commits.
- Do not merge while local validation, required PR checks, or preview
  deployment is failing. After merge, monitor the main workflow and all four
  production deployments. A post-merge failure requires immediate diagnosis
  and either a corrective pull request or a revert; it is not represented as a
  pre-merge condition.

## Delivery

The work will be delivered as one pull request with logical commits for the
major-version checkpoints, compatibility fixes, CI guardrail, and audit record.
The pull request will be squash-merged only after required checks and previews
pass. npm publishing remains independent and tag-triggered. The existing main
workflow will perform production deployment after merge, and that run will be
monitored through completion.

## Follow-Up

Replace the exact NgRx `22.0.0-rc.0` pins with the stable NgRx 22 release and
the exact Analog `3.0.0-alpha.64` pins with the stable compatible Analog release
once each is published. Each replacement must run the same dependency-tree,
workspace, preview, and production validation suite. Remaining audit findings
will be handled according to the updated audit record.
