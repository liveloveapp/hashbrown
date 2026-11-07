# npm 0.9.0 / NuGet preview.2 publication-session handoff

Publication is reserved for a new explicitly authorized session. This readiness
change does not publish packages, create a GitHub release, tag a version, move a
channel tag or dispatch a publisher. A documentation deployment from main is
independent of package publication. Do not publish an announcement before both
registries are verified.

## Before publication

- Select the exact merged reviewed revision and confirm green main CI and the
  documentation deployment revision. Rebuild/requalify any artifact whose source
  or dependency provenance differs from its receipt.
- Confirm all ten npm release packages are exactly `0.9.0` and the .NET package is
  exactly `0.1.0-preview.2`. Keep third-party dependencies and frozen npm `0.8.3` /
  official preview.1 baselines intact.
- Retain exact archive, installed-package, dependency closure, producer and loaded
  assembly witnesses. Candidate qualification is not public-registry evidence.
- Read actual integrated acceptance reports for affected build/test/lint, the
  32 compiled documentation programs, ABI/old-server checks, full 664-case source
  suite, 372-case cold candidate suite, 20 isolation controls, both real starter
  clients and the separate 12-case recovery profile. Require cleanup and ownership
  evidence from the full `npx nx test-harness dotnet-conformance`,
  `npx nx test-runtime dotnet-conformance` and `npx nx test core` targets, including
  core cold recovery cleanup/remount coverage. No separate 40-case cleanup
  inventory is verified, and full-target totals are not cleanup-case counts.
  Intended inventories alone are not passes. Record unavailable external
  qualifications separately.
- Follow the existing [npm release runbook](../../release-runbook.md) and reviewed
  NuGet publisher workflow only after explicit release approval. Do not repair
  AWS OIDC, add release safeguards, expand runtime support or run deferred
  Azure-hosted managed identity qualification as part of this handoff.

## After both publications

Read the official registries using exact versions, never ranges or `latest`:

```sh
npm view @hashbrownai/core@0.9.0 version dist.integrity --json --registry=https://registry.npmjs.org/
npm view @hashbrownai/react@0.9.0 version dist.integrity --json --registry=https://registry.npmjs.org/
npm view @hashbrownai/angular@0.9.0 version dist.integrity --json --registry=https://registry.npmjs.org/
```

Verify the other seven release-group packages as required by the runbook. Retrieve
NuGet preview.2 from the official source and retain its real signature, payload,
producer and archive/DLL receipts; do not invent hashes or reuse preview.1
receipts. Prepare fresh exact registry-installed clients and server consumers;
reject mixed origins, source fallback and missing receipts. Execute the future
public release-recovery profile using its documented explicit metadata selections.
Use the exact candidate/public commands and required producer receipts in the
[release-recovery runner](../../../tools/conformance/dotnet/release-consumer/README.md).
Retain before/after qualification and cleanup evidence. Its twelve cases cover six
framework/authentication compositions times cold restore/result reconciliation;
the separate 54-case historical live baseline remains unchanged.

The new recovery profile reserves at most three calls per case and three
preflights (39 total), at most 384 output tokens per call, 60 seconds per case and
900 seconds per run, serial with zero retries. Its provider-free list/selection
must complete before credential loading. Use only the explicitly authorized
server-side credential file or existing selected Azure CLI profile; never pass
credentials into frontend builds, browsers, URLs or diagnostic payloads. Record
actual usage and failure/cleanup evidence. Registry identity alone does not
establish live qualification.

Only after both packages and required public qualifications are verified, update
the mirrored website preview.1 installation commands, PackageReferences and
matching npm pins to `0.9.0` / preview.2. Update the compatibility availability
labels and remove obsolete unreleased qualifiers in one reviewed docs change.
Update the published-recipe validator intentionally with the website pins; candidate
recipe compilation must continue selecting the exact candidate deliberately.
The generated C# reference also has an explicit release state: update the SDK
reference generator, website input reader, validation tests and rendered label
from `unreleased` / Upcoming to the reviewed published state, regenerate committed
`packages/dotnet/api/reference-docs.json`, and compile, test and deploy the result.
Do this only after both official publications. Website builds must continue to use
committed input without automatic registry lookup or requiring a .NET SDK.
Keep the historical preview.1 limitations and evidence identified as historical.
The packed preview.2 README already contains conditional exact preview.2 commands
so its immutable published copy remains useful. Never plan to rewrite a README
inside an already-published immutable NuGet archive.

Then date the curated `0.9.0 (Unreleased)` changelog and prepare any separately
authorized announcement. Link the React/Angular prose migration because old Magic
Text exports, selectors and CSS hooks are removed without aliases. Keep the
workbench accurately described as a client replay, distinct from the starter.

## Deployment and support boundaries

Stop and drain incompatible workers before deploying the coordinated server and
clients; retain stable scope/agent/catalog/configuration identities and initialize
the durable schema before readiness. Custom journals need explicit V2 browser
recovery support and their own maintenance policy. Unknown effects and unavailable
browser observations require independent outcome evidence and application policy,
never automatic redispatch. No exactly-once external effects or mixed-version
rolling upgrade is promised.

Cloud-hosted managed identity qualification and .NET 8/9 support remain follow-ups.
This checklist is a release-session work list, not a record that those actions or
any public preview.2 verification have occurred.
