# Independent full .NET source-browser CI qualification

Status: approved design; regression tests and workflow implementation authored; verification pending.

## Requirement

Local required source-provider runs have completed as failed partial/full packets under substantial shared-host load. Passing an unchanged isolated repeat does not establish their cause or qualify the original failures. Preserve every current source test, eight framework/provider/API projects, workers1/retries0, five-second expectations and30second cases. Do not use grep, shards, retries, skipped rows, timeout overrides, cloud cache or live credentials.

A new dotnet-source-browser job runs alongside candidate-cold-recovery after successful ci and its existing complete-affected-graph dotnet selection. Both use independent Ubuntu runners with independent owned PostgreSQL18 containers and300minute limits. Source and candidate are separate qualification domains; neither substitutes for the other or changes package-pr-acceptance, old release/upgrade/live/deploy contracts.

## Source job contract

Use existing pinned checkout, Node from.nvmrc, locked npm ci, setup-dotnet/global.json+lock inputs and the installed pinned Playwright Chromium setup. Set explicit source host mode, no Nx cloud/daemon, Nx parallel1 and fixture-only PostgreSQL connection. Its owned container is hashbrown-postgres-source, with bounded genuine readiness checks and always cleanup.

Run the exact full uncached command:
`npx nx provider-e2e dotnet-conformance --skipNxCache --reporter=list,json`

The sole reporting override changes output, never test selection. PLAYWRIGHT_JSON_OUTPUT_FILE points to test-results/dotnet-source-browser/report.json. Always upload that owned JSON inventory and original test-results/conformance/dotnet diagnostics, plus the existing HTML report directory when available; do not claim HTML is generated when the CLI reporter override disables it. Missing all evidence fails upload. JSON retains actual selected cases and results for independent review; no expected count is invented by the workflow.

## Required aggregate and dispatch

Keep PR Gate's existing identity and CI/target/preview checks. Add the source job dependency and actual result. When affected dotnet is true, require both source and candidate success. When false, each may only be success or skipped. Missing/invalid selection, missing result, cancellation or failure rejects. Execute the actual workflow Bash in the maintained truth-table regression, rather than mirroring its policy in another implementation.

Existing workflow_dispatch can run both full jobs on an exact feature-branch SHA using the same affected selection. Existing deployment selectors remain main-only for non-PR dispatch, so this does not request a preview/production deployment. No release/deploy permission or secret changes.

## Tests and verification

Tests parse existing YAML with the existing dependency, assert the own runner/toolchain/database/full-command/evidence/cleanup contract, actual aggregate Bash truth table, feature dispatch boundaries, existing pure complete-graph setup selector and immutable source Playwright configuration. Update the old NuGet static workflow expectation only to include the independent source job; its package plan remains unchanged.

Missing job is initial static RED; ignoring source failure in actual current PR Gate Bash supplies meaningful policy RED. Parent runs those tests before workflow implementation, then CI/configuration gates and independent frozen review. Root preserves source/candidate provenance and reruns the bounded12stage Pydantic recipe after the final workflow commit because pr-main.yml is an existing bound input. No source fingerprint exception or full acceptance claim.
