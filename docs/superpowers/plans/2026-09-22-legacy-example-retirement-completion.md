# Canonical example consolidation and legacy retirement

The maintained public example is `examples/invoicing`. This retirement follows
its migration to B4 0.9.0 and Vercel and the assertion-preserving migration to its
canonical e2e project. Performance measurement remains a separate follow-up.

## Removed repository surfaces

- All seven legacy roots under `samples`: Fast Food, Finance, Smart Home,
  Kitchen Sink, Spotify, Lambda Chat, and the React Vox demo.
- The entire `packages/vox` package and `wasm` VAD source/build/binary tree.
- Vox aliases, special Nx plugin configuration, and the Vox-named release-test
  fixture (replaced by a generic private-package fixture).
- Legacy Storybook configuration and the explicit Smart Home CI step.
- Exclusive application dependencies and their lockfile entries, including
  Serverless, Spotify, NgRx store/effects, Storybook, and legacy UI packages.
- Legacy website showcase assets, navigation, and current setup instructions.

## Preserved behavior

The canonical e2e project owns application flows, framework conformance hosts,
provider route fixtures, and native-provider browser cases. The assertion ledger
at `canonical-example/assertion-baseline.json` records the original guarantees
and their current destinations. Angular support and native OpenAI Node/Worker
coverage remain; Vox tests intentionally retire with Vox itself.

The website directs visitors to the Invoicing app. Existing `/samples/finance`,
`/samples/fast-food`, and `/samples/smart-home` URLs explain retirement and link
to the maintained example. Historical articles pin old source links to commit
`43e40ba5`; historical plans and changelogs retain the recorded history.

Shared dependencies stay when used by supported libraries, tooling, or the docs
site. In particular, Express/CORS support provider fixtures, NgRx signals support
Angular, and Zustand's version is consumed by StackBlitz tooling.

## External resources and local artifacts

This is repository retirement. It does not unpublish npm packages or delete cloud
resources or DNS. The existing optional Cloudflare teardown inventory in
`tools/vercel/bootstrap.mjs` remains accurate for a separate decommissioning action;
it is not an active example build/deploy target and was not executed.

Local generated files under the retired `samples` directory are ignored so they
cannot reintroduce Nx projects. Untracked user work is not included in this PR.
The Invoicing production homepage returned HTTP 200 during the retirement check;
this is availability evidence, not a live model or full production workflow test.

## Verification

- Full Nx build, test, lint and typecheck passed for all 19 target-bearing projects
  (57 tasks including dependencies), rerun after the final dependency removals.
- All 64 canonical browser cases passed: application, Angular/React conformance,
  and native-provider scenarios.
- Website and Invoicing deployment-artifact e2e checks passed.
- All 12 release-tooling tests and `npm ls --all` passed.
- Built website routes `/`, `/samples`, the three retired sample routes, and
  both framework sample guides returned HTTP 200 with the canonical content.
- Independent scope and code-quality reviews approved the change.

Existing lint, API-extractor, bundle-size and tooling warnings remain. One Nx
Cloud upload timed out after successful local deployment-artifact verification.
PR CI and preview deployment remain the final merge gate.
