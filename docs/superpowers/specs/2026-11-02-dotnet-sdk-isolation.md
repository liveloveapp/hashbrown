# Isolate the exact .NET SDK in non-release qualification jobs

Status: workflow RED witnessed (three failures / seven passes), then all ten workflow tests passed. Conformance build/test/lint, the actual published baseline and four old-server controls passed; fresh recipe and full hosted qualification remain pending. This change is confined to four non-release setup steps: PR/main ci, candidate-cold-recovery, dotnet-source-browser, and nightly dotnet package acceptance. Publisher and release workflows are excluded.

## Observed failure and cause

Corrected CI run [41556941212](https://github.com/liveloveapp/hashbrown/actions/runs/41556941212), at [7f32c6ce4831d822cbce8271a6d2230ff7b0c82b](https://github.com/liveloveapp/hashbrown/commit/7f32c6ce4831d822cbce8271a6d2230ff7b0c82b), passed runtime 385 and full website qualification, but package acceptance reached a genuine historical-baseline SDK failure after documentation passed. The invoked SDK reported 10.0.403; the historical helper requires exactly 10.0.402.

The current global.json requests 10.0.402 with latestPatch. Supplying that file to setup-dotnet permits its documented latest-patch installation behavior. A private install directory alone does not constrain the selected SDK. Supplying both global-json-file and dotnet-version can install both selections, so it does not establish the strict historical requirement either.

## Approved boundary

Each of the four setup-dotnet@v6 steps must set step-local DOTNET_INSTALL_DIR to `${{ runner.temp }}/hashbrown-dotnet-sdk` and use dotnet-version: 10.0.402 as its sole SDK selection input. Omit global-json-file, channel, quality and workload selectors. Preserve every existing cache and cache-dependency-path input, action version, job condition, permissions, dependency, release/deployment guard and qualification command.

Do not change current or frozen global.json files, historical SDK guards, lockfiles, helpers, publishers, release workflows or dependency versions. The isolated root scopes installation to this owned job; it is not a general guarantee about arbitrary PATH or host SDK selection. The actual historical helper must still prove that its unchanged dotnet invocation resolves exactly 10.0.402.

## Test and verification plan

Workflow tests first assert all four actual setup steps, the exact private root and official version input, absence of additional selection inputs, unchanged cache inputs and the current/historical strict version relationship. Existing source and cold job contracts must expect the explicit version instead of the global-json setup input. Root records the failing workflow tests before authorizing YAML implementation.

The root-run physical SDK probe passed: the unchanged frozen latestPatch producer selected 10.0.403 through the real Homebrew host and exactly 10.0.402 through the private physical host, with both roots present on PATH. Its nested Node child observed the selected version, the SDK list contained only that selected root, and the original global.json bytes remained unchanged. Actual published-baseline qualification using the private 10.0.402 host passed all 13 substeps, including the strict SDK check, signed archive download/import, public package qualification, npm preparation/qualification and unchanged producer checks. Four old-server controls then passed all 16 refusal checks with no provider work or physical-state change. Focused tests or discovery do not replace the complete package result.

Changing pr-main.yml changes a bound recipe input. A fresh source checkpoint, actual 12-stage execution, evidence checkpoint/tag, pin and generated-program/website verification are required; copying an old source fingerprint is forbidden. Publisher/release exposure remains a separate follow-up outside this change.

## References

- [Official setup-dotnet v6 README](https://raw.githubusercontent.com/actions/setup-dotnet/v6/README.md): version selection, global.json behavior and installation directory.
- [Microsoft global.json SDK selection](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json): roll-forward and latestPatch semantics.

These sources inform the setup design; actual workflow, physical SDK and qualification evidence are required before claiming success.
