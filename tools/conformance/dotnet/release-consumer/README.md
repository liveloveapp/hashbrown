# Release recovery qualification

This profile is separate from the retained 54-case npm 0.8.3/NuGet preview.1 live baseline. It owns twelve cases: the six existing React/Angular × OpenAI-key/Azure-key/Azure-CLI compositions, each running `cold-restore` and `result-reconciliation`. It reserves three native attempts per case and the three existing preflights: 39 total. Output is capped at 384 tokens; a shared case deadline is 60 seconds, the run deadline is 900 seconds, execution is serial, and retries are zero. The single 900-second invocation deadline starts before initial package qualification and credential loading and includes final provenance verification after cleanup. Each 60-second case deadline spans both worker lifetimes, browser actions, anchored pointer/loaded-DLL checks and cleanup; replacement never renews it. Deep package qualification runs once before credentials and once after all native workers drain, while cases recheck the original physical pointer and loaded assembly anchors. Exhausting either deadline fails the run, including the final case or postflight. Provider-free cleanup is still attempted under bounded cleanup deadlines after cancellation.

Publication of npm 0.9.0 and NuGet 0.1.0-preview.2 is **not authorized in this change**. No new public integrity/signature values are embedded. Actual public verification is a post-publication action in a separately authorized session.

## Provider-free inventory

```sh
npx nx release-recovery-list dotnet-conformance
```

The exact twelve identities are listed before package pointers, credentials, databases, browsers or child processes are accessed.

## Candidate qualification before publication

Prepare fresh candidate artifacts only after shared fixture, consumer and runner sources stabilize. Existing candidate artifacts become stale whenever their qualified source closure changes. Do not reseal old pointers.

```sh
npx nx prepare-candidate-npm dotnet-conformance -- --metadata=/private/tmp/release-recovery/npm-candidate.json
npx nx prepare-candidate-nuget dotnet-conformance -- --metadata=/private/tmp/release-recovery/nuget-candidate.json
```

For deterministic actual-worker/browser controls, set the two exact candidate pointers and the authorized PostgreSQL connection in the parent environment, then run:

```sh
npx nx release-recovery-selection-controls dotnet-conformance
npx nx release-recovery-controls dotnet-conformance
```

`HASHBROWN_CANDIDATE_NPM_METADATA` and `HASHBROWN_CANDIDATE_NUGET_METADATA` select those pointers; `DOTNET_TEST_POSTGRES` supplies PostgreSQL. These controls use an explicitly labeled local native Responses endpoint. Their synthetic model output/usage never establishes live cloud qualification. They exercise both real framework consumers, replacement workers with the same schema/package, completed-result adoption, missing genuine usage rejection and physical Publishing/native-teardown fencing. Additional actual-worker controls deliberately reuse/leave a worker running, reset the durable schema, reenter the browser handler, append an extra real server effect, alter original native call/result input beneath the passive observer, attempt a late dispatch, corrupt a real Completed delivery, trigger a genuine native run during a read, and crash the replacement during cleanup. A control passes only when its exact independent guard rejects the reached fault. Separate selection controls accept the actual current pair and temporarily tamper owned pointer/archive/installed/module/DLL/role/runtime bytes, checking refusal before credential reads and restoring exact bytes/modes. The retained generic twenty tamper controls remain required as well.

For the live profile, set `HASHBROWN_DOTNET_LIVE=1` and `DOTNET_TEST_POSTGRES` in the parent environment. The explicit credential file must contain `OPENAI_API_KEY`, `AZURE_API_KEY`, `AZURE_ENDPOINT`, and optionally `AZURE_MODEL=gpt-4.1-mini`. Azure CLI authentication comes from the already authorized local CLI account. `AZURE_CONFIG_DIR`, when needed, reaches only the Azure CLI native child. No credential is sent to browsers or public preparation/qualification children.

```sh
npx nx release-recovery dotnet-conformance -- --mode candidate --npm-metadata /private/tmp/release-recovery/npm-candidate.json --nuget-metadata /private/tmp/release-recovery/nuget-candidate.json --credentials /absolute/authorized/root.env
```

Candidate reports remain `source-candidate`. All package qualifiers run before credential loading and after native children drain; changed pointers, archives, installed modules, role/runtime sources and loaded DLLs fail qualification. Reports persist only identities, hashes, fixed enums and counters. Browser and native raw proof stays bounded in memory; screenshots, video and traces are disabled. Missing usage, cleanup or provenance fails qualification.

## Future public preparation and verification — publication session only

After the separately authorized coordinated publication, preserve the actual SDK producer checkout and its exact three `dist/packages` builds, unsigned NuGet archive and symbols. Obtain the real official source ZIP for the published producer revision from:

`https://codeload.github.com/liveloveapp/hashbrown/zip/<actual-40-character-producer-revision>`

Create an independently retained producer receipt JSON containing `root` (physical producer checkout), `revision`, `sourceUrl`, `sourceArchive`, `sourceArchiveSha256`, `sources` (complete SHA256 source inventory including all four SDK source trees), and `packages` (full SHA256 file inventories of the actual three npm producer builds keyed by `@hashbrownai/core`, `@hashbrownai/react`, `@hashbrownai/angular`). Obtain all values from actual bytes. The public verifier compares the source ZIP to the fixed official URL, every SDK source to that archive and producer checkout, the producer checkout revision, and actual build trees. It does **not** require that the runner HEAD equals the producer: a later documentation-only revision can qualify the original published producer.

Download the exact official signed NuGet archive. Prepare the signed consumer using the existing SDK package guard from the preserved producer checkout, supplying both actual archives:

```sh
npx nx package-prepare dotnet-conformance -- --metadata /private/tmp/release-recovery/public-nuget-package.json --published-archive /absolute/official/Hashbrown.AspNetCore.0.1.0-preview.2.nupkg --qualified-archive /absolute/producer/Hashbrown.AspNetCore.0.1.0-preview.2.nupkg
```

The qualified `.snupkg` must accompany the unsigned archive. The existing preparation performs real repository-signature verification, canonical SHA512 calculation, complete signed/unsigned payload comparison, symbols/producer checks, isolated PackageReference builds, role/runtime/evaluation closure checks and an actual loaded assembly smoke. Never substitute preview.1 metadata or JSON `passed` flags.

Prepare separate official-origin bindings and registry-installed recovery consumers:

```sh
npx nx prepare-release-public-npm dotnet-conformance -- --metadata=/private/tmp/release-recovery/npm-public.json --producer=/absolute/retained-producer-receipt.json
npx nx prepare-release-public-nuget dotnet-conformance -- --metadata=/private/tmp/release-recovery/nuget-public.json --package-pointer=/private/tmp/release-recovery/public-nuget-package.json --producer=/absolute/retained-producer-receipt.json
npx nx release-recovery dotnet-conformance -- --mode public --npm-metadata /private/tmp/release-recovery/npm-public.json --nuget-metadata /private/tmp/release-recovery/nuget-public.json --credentials /absolute/authorized/root.env
```

Public preparation installs exact registry 0.9.0, preserves the external dependency graph, builds the same recovery templates and records real official npm tarball URLs/SRI/gitHead, lock/installed origins, package bytes, module origins and consumer build closure. Public qualification independently re-fetches official metadata/package/source bytes, reruns NuGet signature/canonical-hash/public-smoke checks and verifies actual loaded role bytes. Candidate/public mixtures, ranges, latest, source fallback, missing official receipts or tampering are rejected. No preparation command publishes a package or moves a registry tag.
