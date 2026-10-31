# NuGet trusted publishing and public acceptance

Publish `Hashbrown.AspNetCore` `0.1.0-preview.1` to NuGet.org using the saved trusted-publisher policy: user `blove`, owner `liveloveapp`, repository `liveloveapp/hashbrown`, workflow `nuget-publish.yml`, environment `nuget`. The user authorized implementation, PR, merge on green, publication and end-to-end verification without additional routine approval.

## Design

Use a manual main-only workflow. A qualification job requires successful PR/Main CI for the dispatch SHA, installs existing pinned tools, starts owned PostgreSQL, and runs the existing full package acceptance target. This packs once and qualifies the exact 664-case matrix, six deadline regressions, 32 documentation programs and historical upgrade. Main's bounded PR acceptance artifact is insufficient for this release; the dedicated job produces full proof.

A publisher job downloads that job's artifact, validates complete successful proof, source revision and exact archive hashes before requesting OIDC credentials through NuGet/login. Only this job grants id-token:write and uses environment nuget. It pushes the qualified package and portable symbols, without repacking. Concurrency queues releases rather than cancelling publication. Authentication occurs immediately before push, after the expensive qualification.

A postpublication job downloads the exact public NuGet.org package into a fresh owned root, verifies its repository signature with the SDK, and compares all unsigned payload entries against the qualified artifact. NuGet repository signing changes archive bytes, so retain raw hashes separately from the SDK's canonical package content hash and require canonical equality to the qualified original. Run the complete existing acceptance graph importing this downloaded archive with zero pack invocations. Restore still uses exclusive physical candidate feed/source mapping and fresh caches, proving downloaded package bytes rather than source fallback. Capture public download URL, signature verification, hashes, payload equality and organization ownership. Public ownership must include liveloveapp; credentials/keys never enter exported evidence.

## Scope and failures

Keep source-pack mode unchanged and reject arbitrary candidate reuse or partial release profiles. Imported mode is explicit and validates the expected source revision, archive identity and comparison artifact. Missing/changed archives, failed or bounded proof, wrong SHA, missing signature, payload mismatch and failed public availability fail closed. Poll public indexing for a bounded period. Do not skip conflicting versions or overwrite a published version; a retry may only accept an already-published package after proving complete equivalence. No npm release, new package dependencies, fresh live provider calls, Azure resource provisioning, or unrelated release safeguards.

GitHub setup adds environment nuget and repository variable NUGET_USER=blove. NuGet policy is already saved by the human. Organization membership/ownership errors requiring account changes are reported for human input rather than hidden by changing ownership expectations.

## Validation and delivery

Write failing top-level tests first for release artifact selection, proof/revision/hash checks, signed archive equivalence and imported mode/no pack/canonical hash semantics. Run affected builds/tests/lint. Independently review design and implementation. Create a PR and merge only after required exact-head checks are green. Dispatch from merged main; audit actual qualified and public artifacts and exact outcomes, then verify public package restore and all full matrix identities across React/Angular, OpenAI/Azure and Responses/Chat Completions. Update installation docs after public publication is confirmed and preserve accurate unpublished wording until then. Preserve sanitized evidence; remove only owned temporary resources.
