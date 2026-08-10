# Dependency Audit Triage: 2026-08-07

## Decision

The Angular 22 and Nx 23 migration can proceed to its final release gate. The
post-migration lockfile has no critical findings, the one newly introduced
advisory identity is on a development-only Storybook path, and no current
finding has been identified on a deployed application runtime path.

This is not a claim that every deployed bundle is vulnerability-free. npm
classifies package metadata and dependency paths, not bundle contents or
runtime reachability. Audit totals also change as npm's advisory data changes,
so they remain a reviewed diagnostic rather than a numeric CI gate. A clean
dependency tree is enforced separately with `npm ls --all`.

## Post-Migration Compatibility Set

The post-migration audit was regenerated on 2026-08-10 with Node.js v24.18.0
and npm 11.19.0. No `npm audit fix`, `--force`, `legacy-peer-deps`, override, or
dependency downgrade was used.

| Package set                | Selected version               |
| -------------------------- | ------------------------------ |
| Angular framework          | `22.1.1`                       |
| Angular build and Devkit   | `22.1.3`                       |
| Angular Material and CDK   | `22.1.1`                       |
| Nx and first-party plugins | `23.1.1`                       |
| TypeScript                 | `6.0.3`                        |
| SWC CLI/register/core      | `0.8.1` / `1.12.1` / `1.15.47` |
| First-party Analog set     | exact `3.0.0-alpha.64`         |
| NgRx set                   | exact `22.0.0-rc.0`            |

The install was verified in an isolated `/tmp` checkout where `nx` was not
resolvable before installation, preventing fallback to any parent
`node_modules`. In that checkout:

- `npm ci` installed the committed lockfile and exited successfully.
- `npm ls --all` exited successfully with no invalid or extraneous packages.
- Aligning every first-party Nx package at 23.1.1 and selecting compatible
  `@swc-node/register` and `@swc/core` versions resolved the prior mixed Nx and
  SWC peer failures.
- Pull request and main CI now run `npm ls --all` immediately after `npm ci`.

## Audit Totals

| Snapshot                            | Total | Low | Moderate | High | Critical |
| ----------------------------------- | ----: | --: | -------: | ---: | -------: |
| Prior recorded full baseline        |    99 |   5 |       36 |   57 |        1 |
| Prior recorded production baseline  |    28 |   2 |        5 |   21 |        0 |
| Prior lock, current advisory feed   |   102 |   4 |       37 |   60 |        1 |
| Prior lock production, current feed |    29 |   1 |        6 |   22 |        0 |
| Post-migration full                 |    39 |   0 |       15 |   24 |        0 |
| Post-migration production           |     2 |   0 |        0 |    2 |        0 |

Compared with the recorded baseline, the full total fell by 60 findings: 5
fewer low, 21 fewer moderate, 33 fewer high, and 1 fewer critical. The
production total fell by 26 findings: 2 fewer low, 5 fewer moderate, and 19
fewer high. The unchanged prior lock now reports 102 full and 29 production
findings under the current advisory feed, rather than its recorded 99 and 28.
That drift is why totals alone are not attributed entirely to the migration.

Both current audit commands exit nonzero because accepted findings remain. The
JSON reports were captured without changing the manifest or lockfile.

## Current Full-Audit Classification

The categories below are non-overlapping and account for all 39 reported
vulnerability objects.

| Dependency path                 | Objects and severity | Exposure classification                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nx toolchain                    | 20 high              | Build and development tooling. The root `nx` dependency and first-party Nx plugins are not application runtime dependencies.                                                                                                                                                                     |
| Angular Webpack build chain     | 3 high, 4 moderate   | Build and development tooling through `@angular-devkit/build-angular`, `@angular-devkit/build-webpack`, `less`, `image-size`, `webpack-dev-server`, `sockjs`, and `uuid`.                                                                                                                        |
| Analog/Nitro/Cloudflare tooling | 1 high, 5 moderate   | Development, build, and deployment tooling through `@analogjs/platform`, `nitro`, `env-runner`, `miniflare`, `wrangler`, and `undici`. Analog builds the deployed website, but this metadata path does not prove the vulnerable `undici` copies are present or reachable in its deployed output. |
| React Router 6                  | 2 moderate           | Used by React samples, including `smart-home-react` and `react-vox-demo`; neither is one of the current Cloudflare production deployments.                                                                                                                                                       |
| Storybook MCP                   | 3 moderate           | Development-only Storybook path through `@storybook/addon-mcp`, `@storybook/mcp`, and `valibot`.                                                                                                                                                                                                 |
| Serverless                      | 1 moderate           | Development and sample deployment tooling. Its vulnerable `undici` copy is included in the Analog/Nitro/Cloudflare row's shared high `undici` object.                                                                                                                                            |

The Nx row is dominated by one transitive path: Nx 23.1.1 pins a nested
`brace-expansion` 5.0.8 affected by GHSA-rgw5-rvv9-x895. The lockfile also has
a top-level `brace-expansion` 5.0.9, which is outside that advisory, but it
cannot replace Nx's exact nested dependency. npm proposes downgrading Nx to
22.6.5; that would undo the supported migration and is not an acceptable
automatic fix.

The Analog/Nitro/Cloudflare and Serverless rows share `undici` findings under
`miniflare` and `serverless`. All packages in those current paths are marked
development-only in the lockfile. Wrangler 4.114.0 also has a non-major audit
update available at 4.120.0, which should be handled in a focused follow-up
because Wrangler is intentionally exact-pinned.

## Production Metadata Classification

`npm audit --omit=dev` reports only two high objects:

```text
nx@23.1.1 -> brace-expansion@5.0.8
```

Although root `nx` is a dev dependency, npm marks `@nx/devkit`, `nx`, and the
nested `brace-expansion` as `devOptional`. The metadata path begins with the
production `@analogjs/content` dependency's optional `@nx/devkit` peer, whose
peer is `nx`. npm therefore retains these nodes for `--omit=dev` auditing.

This explains the production audit result but does not establish deployed
runtime exposure. Nx is invoked for workspace builds and is not imported by a
deployed application. No post-migration audit object is currently attributed
to an Angular or Analog browser/server runtime package. Bundle inspection or a
runtime-path analysis would be required to make a stronger reachability claim.

## Changed-Path Review

A same-day rerun of the prior lockfile against the current advisory feed was
used to distinguish lockfile changes from advisory-feed drift.

- The only advisory identity present in the migrated lock but absent from the
  prior lock is the moderate Valibot advisory
  GHSA-5qjj-4xww-7phc. It enters through the new development-only Storybook MCP
  path and is not a deployed runtime finding.
- Angular 20 runtime paths previously exposed advisories through
  `@angular/common`, `@angular/core`, `@angular/compiler`, and
  `@angular/platform-server`. Angular 22.1.1 is outside those affected ranges,
  so those production runtime findings are absent.
- The prior Analog content/router production path through `sharp` and related
  platform dependencies is absent from the migrated production report. The
  current Analog alpha has a different resolved graph; this audit outcome does
  not by itself prove deployed bundle reachability.
- Nx's prior graph-server and remote-cache advisories and many older nested
  `brace-expansion` copies are absent after alignment. The separate
  `brace-expansion` 5.0.8 advisory described above remains under Nx 23.1.1.
- Findings previously attributed to MCP, Mermaid, PostCSS, Verdaccio, and the
  Serverless Offline/Velocity.js critical path are absent from the current
  report after lockfile regeneration and dependency resolution. These are
  recorded as lockfile outcomes, not claimed as direct Angular/Nx fixes.
- Existing advisory identities remain on the Angular build `image-size` path,
  React Router 6, `undici` under Miniflare and Serverless, `uuid` under SockJS,
  and the remaining Nx `brace-expansion` path.

## Remediation Order

1. Upgrade Nx when a supported Nx 23 patch replaces its nested
   `brace-expansion` 5.0.8. Do not accept npm's proposed Nx 22 downgrade.
2. Replace every exact NgRx `22.0.0-rc.0` pin with the stable NgRx 22 release
   when published, then rerun dependency-tree, workspace, API, preview, and
   production validation.
3. Replace every first-party Analog `3.0.0-alpha.64` pin with a stable
   Angular 22-compatible Analog release when published. Re-audit Nitro,
   Miniflare, and deployed website paths and repeat preview smoke tests.
4. Validate Wrangler 4.120.0, patched Angular build dependencies, and patched
   Miniflare/Serverless `undici` versions in focused tooling updates.
5. Update or replace the Storybook MCP/Valibot path and plan the React Router 7
   sample migration separately; both require compatibility validation rather
   than an automatic audit downgrade.

## Release Boundary

npm publishing remains independent and tag-triggered. This migration and audit
record do not change npm release triggers, permissions, tags, trusted
publishing, or package publication behavior.
