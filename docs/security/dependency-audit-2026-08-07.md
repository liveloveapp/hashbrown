# Dependency Audit Triage: 2026-08-07

## Decision

The current dependency findings do not block the GitHub Actions v7 maintenance
pull request. That pull request changes the runtime used by GitHub-owned actions
and does not change application dependencies or npm release behavior.

Dependency remediation must begin with alignment of the complete Nx toolchain.
An audit CI gate should not be added until the baseline has been intentionally
reduced and the resulting dependency tree is valid and reproducible.

## Current Committed Lockfile

Diagnostics used Node.js v24.18.0 and npm 11.16.0.

| Scope      | Total | Low | Moderate | High | Critical |
| ---------- | ----: | --: | -------: | ---: | -------: |
| Full       |    99 |   5 |       36 |   57 |        1 |
| Production |    28 |   2 |        5 |   21 |        0 |

`npm audit --omit=dev` follows package metadata and dependency paths; it does
not prove that a package is reachable in a deployed bundle. Repository use
provides a more specific exposure classification:

- **Deployed browser or server runtime:** Angular 20.3.25 runtime packages are
  used by deployed applications. Analog content and router packages are
  imported by the `www` app, including its server entry points.
- **Sample runtime:** Model Context Protocol SDK 1.29.0 is imported by Spotify
  sample client and server code. Spotify is not one of the four current
  Cloudflare production deployments.
- **Build and development tooling:** Nx and Devkit packages and PostCSS 8.5.16
  paths are used in build or development workflows. The sole critical finding,
  Velocity.js 2.1.6 through Serverless Offline 14.7.4, is development-only. It
  still affects local and CI development surfaces and requires remediation.
- **Removal candidate:** No Mermaid 10.9.6 source import was found in the
  repository. Its need should be verified and it should be removed if unused,
  rather than assumed to be deployed.

## Dependency Tree Caveat

The baseline peer dependency tree is not known to be healthy. A reused install
contained 17 extraneous nested packages and could allow `npm ls` to pass. The
reproducible clean baseline check with Node.js 24 and npm 11 is:

```sh
npm ci
npm ls --all
```

This clean-install check from the committed lockfile produced the invalid mixed
Nx and SWC peer result. No retained artifact from that run is available, so
future migration pull requests must rerun the check and preserve its result in
CI. Results from the reused installation are not evidence that the committed
dependency tree can be reproduced cleanly.

## Disposable Resolution Experiments

Two experiments were used to evaluate remediation boundaries. Both were
disposable: all manifest and lockfile changes were discarded. No force,
`legacy-peer-deps`, override, dependency downgrade, or package change was
retained.

### Full clean lock regeneration

A clean regeneration reduced the full audit to 59 findings: 2 low, 27 moderate,
30 high, and 0 critical. The production audit fell to 3 findings, all high.

The resulting tree was invalid. `npm ls` reported invalid `chokidar`,
`@nx/eslint`, `@swc-node/register`, and `@swc/core` packages, plus an extraneous
`@swc/wasm` package. The audit improvement therefore could not be retained as a
valid dependency update.

### Non-forcing audit fix

`npm audit fix --package-lock-only --ignore-scripts` reduced the full audit to
73 findings: 3 low, 26 moderate, 44 high, and 0 critical. The production audit
fell to 14 findings: 0 low, 1 moderate, 13 high, and 0 critical.

This result was also invalid. npm deduplicated `@nx/vite` 22.7.8 into the
Nx 21-era `@nx/eslint` and SWC package set, after which `npm ls` failed. The
non-forcing audit fix was not suitable for the current mixed-major manifest.

## Root Cause

The root manifest mixes Nx 21.5 and 21.6 packages with `@nx/vite` `^22.7.6`.
The current lockfile preserves nested copies that mask parts of this mismatch.
npm 11 re-resolution and deduplication expose the invalid Nx and SWC peer
relationships, so a security-only lockfile refresh cannot safely resolve the
baseline.

## Remediation Order

1. Align or migrate the entire Nx toolchain first. npm currently proposes
   Nx 23.1.1 for this mixed manifest, but the migration must evaluate the lowest
   supported, fully aligned patched Nx release, including patched Nx 22, before
   choosing Nx 22 or Nx 23. Validate every affected lint, test, build, and
   end-to-end target after the migration.
2. Update the Angular runtime to 20.3.27 and align the Angular build tooling.
3. Refresh Model Context Protocol SDK 1.30, Mermaid 10.9.8, PostCSS 8.5.26,
   Serverless Offline 14.8 with Velocity.js 2.1.7, and Verdaccio 6.9.2, then
   re-run full and production audits.
4. Handle compatibility work separately for React Router 7, SWC CLI 0.8.1,
   esbuild 0.28.1, Analog and its platform dependencies, exact-pinned Wrangler,
   and the Serverless downgrade advisory.

These steps must produce both lower audit totals and a clean dependency-tree
validation from a fresh install. Audit totals alone are not sufficient.

## Release Boundary

npm publishing remains independent of the GitHub Actions and dependency
triage work. This document changes no release trigger, permission, package, or
publishing behavior.
