# GitHub Actions and Dependency Security Maintenance

## Goal

Remove the GitHub Actions Node 20 runtime warnings and reduce the current npm
audit findings without coupling deployment maintenance to major framework
migrations.

## Scope

The maintenance pull request will:

- update every `actions/checkout` and `actions/setup-node` reference to the
  current Node 24-based major release;
- preserve the existing Node version, npm caching, permissions, release tags,
  and Cloudflare deployment behavior;
- refresh dependencies only within the version ranges already declared in
  `package.json`;
- accept direct patch or minor upgrades when their existing test coverage and
  affected-project validation pass;
- record unresolved findings that require a major migration or a risky
  downgrade as follow-up work.

The pull request will not:

- run `npm audit fix --force`;
- downgrade packages to versions suggested by npm when doing so would undo the
  current application architecture;
- combine Nx 23 or React Router 7 migrations with deployment maintenance;
- change npm publishing or Cloudflare deployment triggers.

## Implementation

All three workflows will use v7 of GitHub's checkout and Node setup actions.
Existing workflow regression tests will verify every reference, rather than
only checking that each workflow contains at least one current reference.

Compatible direct dependency minimums will be raised within their existing
major release lines, then the dependency lockfile will be regenerated with the
Node and npm versions used by CI. Each resulting direct dependency change will
be reviewed before it is kept. Changes that cross a compatible release line or
introduce an incompatible peer dependency will be reverted from this pull
request and listed as follow-up work instead.

## Validation

Before opening the pull request:

1. Validate workflow YAML and repository-specific deployment tests.
2. Run `npm ci` from the updated lockfile.
3. Run the audit again and compare severity totals with the baseline of 99
   findings: 5 low, 36 moderate, 57 high, and 1 critical.
4. Run Nx affected lint, test, build, and e2e targets.
5. Confirm the npm publishing workflow remains tag-driven and independent from
   Cloudflare deployment.

The pull request will be squash-merged only after `PR / Main CI / PR Gate` is
green. The obsolete Cloudflare cutover worktree will then be removed after a
clean-state check.

## Follow-Up Boundary

Residual findings will be recorded in
`docs/security/dependency-audit-2026-08-07.md` and grouped by upgrade boundary,
especially Nx, React Router, Analog, and build-only tooling. Those migrations
should be handled in separate pull requests with their own compatibility
testing. After merge, only
`/Users/blove/repos/hashbrown/.worktrees/cloudflare-deployment-implementation`
will be removed.
