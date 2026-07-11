# Node 24 Migration Design

## Context

Hashbrown currently uses Node 22.14.0 locally through `.nvmrc`. Two GitHub Actions workflows already read that file, while the PR, nightly, and npm publishing workflows independently select Node 22.x. The npm publishing workflow will move to trusted publishing, which requires Node 22.14.0 or newer and npm 11.5.1 or newer.

Node 24.18.0 is the current Node 24 LTS release and includes npm 11.16.0. Moving the repository to that release satisfies the trusted publishing runtime requirement without installing a second npm version during release jobs.

## Goals

- Use Node 24.18.0 for local development and every GitHub Actions workflow.
- Keep `.nvmrc` as the single source of truth for the Node version.
- Use a maintained `actions/setup-node` major version in every workflow.
- Confirm the existing dependency graph, lockfile, builds, tests, and lint targets work under Node 24.

## Non-Goals

- Configure npm trusted publishers or remove `NPM_TOKEN` in this change.
- Change the release trigger or package versioning strategy.
- Upgrade unrelated dependencies.

## Design

Update `.nvmrc` from `v22.14.0` to `v24.18.0`.

All GitHub Actions workflows will configure Node with `node-version-file: '.nvmrc'`. Workflows that still use `actions/setup-node@v3` will move to v4, matching the existing production and preview deployment workflows. The nightly workflow has a one-value Node matrix today; that matrix will be removed because it duplicates `.nvmrc` without testing multiple versions.

The npm publishing workflow will continue to configure the npm registry and cache while sourcing its runtime from `.nvmrc`. Node 24.18.0 provides npm 11.16.0, so no global npm installation is needed.

## Verification

Run `npm ci` with Node 24.18.0 and retain lockfile changes only if npm produces a necessary deterministic update. Validate all modified workflows with `actionlint` and Prettier. Run the repository's PR CI command set under Node 24, including affected lint, test, and build targets. Run `git diff --check` before integration.

## Rollback

If a dependency or build target is incompatible with Node 24, restore `.nvmrc` and the workflow selectors to Node 22.14.0. Any compatibility fix should be isolated and reviewed separately rather than folded into the runtime migration without evidence.
