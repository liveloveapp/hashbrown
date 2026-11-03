# Preserve hidden candidate evidence in the cold CI artifact

Status: SPEC-approved one-line workflow correction authored. Actual workflow-test RED witnessed two failures / nine passes, both differing only by missing include-hidden-files:true in the exact cold upload object. Focused GREEN, affected gates, actual transfer verification and S3/E3 recapture remain PENDING.

## Observed evidence gap

The retained F2 artifact from [CI 41564111866](https://github.com/liveloveapp/hashbrown/actions/runs/41564111866), source [1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade](https://github.com/liveloveapp/hashbrown/commit/1fb7f7941df9ea20bf44350f6ec3aa3d6fcf3ade), has an authoritative summary inventory of 916 files. The downloaded artifact is missing browser/playwright/.last-run.json, the sole hidden inventoried file. The actual upload job used include-hidden-files:false, the official action default. The missing file is an evidence-transfer gap; it must not be removed from the inventory, fabricated after download or silently ignored by auditors.

The candidate exporter explicitly permits this Playwright receipt. It copies only a finite reviewed receipt vocabulary into an owned export tree and records exact bytes/hashes. It does not export consumer installations, caches, environment files or source trees.

## Narrow correction

Set include-hidden-files:true on only the PR/main candidate-cold-recovery upload-artifact@v7 step named “Upload allowlisted candidate cold evidence”. Keep its exact path test-results/dotnet-candidate-recovery, name, always condition, seven-day retention and missing-file error policy. No glob broadening, alternative directory, exporter change or other upload change is included. Nightly has no corresponding cold artifact step and remains unchanged.

Other package/source/runtime diagnostics uploads must retain their existing hidden-file policy. Release/deployment permissions and guards are untouched. The current [B96 CI run 41575291859](https://github.com/liveloveapp/hashbrown/actions/runs/41575291859) is not relabeled or modified; a later committed correction and actual upload/download verification are required.

## Tests and verification

First change workflow contract tests to require the exact cold upload object including the hidden flag, and ensure every other PR/main artifact step has no new hidden flag. Existing candidate export tests already exercise actual finite vocabulary and secret-file refusal; no new dependencies, exported paths or synthetic receipt fixtures are needed. A source assertion retains the explicit .last-run.json vocabulary.

Root recorded the genuine failing workflow tests before authorizing the one-step YAML correction. Root will now run affected checks and verifies an actual artifact download has the precise inventoried hidden receipt with matching byte count/hash and no extras. Static YAML tests alone cannot prove artifact transfer. Complete candidate/source/full CI acceptance, PR, merge and production verification remain pending.

## Reference

[Official upload-artifact v7 README](https://raw.githubusercontent.com/actions/upload-artifact/v7/README.md) documents include-hidden-files and its false default. Opting in here is bounded by the existing strict owned exporter, not a claim that arbitrary hidden workspace files are safe to upload.

## Required recipe evidence renewal

The PR/main workflow is an explicit bound input in the recipe qualifier. Its verifier reads current source bytes and rejects any change against the retained source inventory. Therefore the authorized YAML correction requires a new committed source checkpoint S3 and an actual complete 12-stage recipe writer execution, followed by a new evidence checkpoint E3, immutable evidence tag, pin update and generated-program verification. Retain E2 and every earlier evidence tag unchanged. A copied capture, edited source hash, hash-only refresh or new pin without execution cannot qualify this change. This new capture and all resulting gates remain PENDING until root executes and records them.

## Executed affected-project checks

After the one-line workflow correction, `npx nx build conformance`, `npx nx test conformance`, and `npx nx lint conformance` passed. The complete unit suite passed 159 tests in 21 suites, including the new hidden-receipt restriction and the existing cold-upload contract. No other upload was opted into hidden files. Actual remote transfer and fresh recipe qualification remain pending.
