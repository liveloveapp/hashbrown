# Published .NET package live qualification

Qualified on 2026-10-31 using runner commit `162682d0c95e72e22ddb4a6cf7a58d384b20c1f4` and the unchanged public package producer `df1340f713d3b65165a494eb09e53246298df858`.

## Result

All **54 distinct browser cases and three preflights passed on the first live attempt**, with no skipped cases, failures or retries. The actual run completed in 4 minutes 16 seconds. This is live qualification of the published NuGet package and published npm clients, distinct from historical source-integration results and deterministic aimock conformance.

| Component | Published version |
| --- | --- |
| Hashbrown.AspNetCore | 0.1.0-preview.1 |
| @hashbrownai/core | 0.8.3 |
| @hashbrownai/react | 0.8.3 |
| @hashbrownai/angular | 0.8.3 |
| Model baseline | gpt-4.1-mini |
| .NET SDK | 10.0.402 |

The six browser projects are React and Angular, each with OpenAI API-key, Azure API-key and Azure CLI authentication. Each project passed all nine groups: streaming text, structured schemas, trusted UI actions, browser tools, server tools, application approval/resume/decline, cancellation/recovery, native mixed tools and genuine native approval. All 54 browser scenarios use Responses. The three preflights exercise OpenAI Responses, Azure Responses and Azure CLI Chat Completions; the Chat Completions preflight is not a full live browser matrix for that API.

## Actual retained evidence

- 93 actual model calls and 93 corresponding HTTP wire facts, all HTTP 200, within 123 fixed reservations and the 128-call run ceiling. Each request uses `store=false` and a maximum output allowance of 384 tokens. Maximum scenario duration was 9,345 ms, below the unchanged 60-second ceiling; the run ceiling remains 15 minutes. Unused reservations do not fund retries.
- All six native approval cases observed a genuine pending request, matched its native binding and journal, admitted and dispatched one approved effect, published its original result and completed a later follow-up. Each has three complete usage calls and zero incomplete usage calls.
- All six mixed-tool cases retained native co-emission and exact-history evidence, one server effect and one durable native effect. The six cancellation/recovery cases each observed cancellation and completed recovery with no effects. Other effect counts match their scenario contracts.
- 70 actual loaded-assembly witnesses: 57 fixture workers, 12 provider-free cleanup workers and one provider-free deterministic probe. Each matched the public package identity, selected assembly path and SHA256 before readiness. Source fallback is unavailable on live execution.
- Public NuGet and published npm descriptors were revalidated independently after all owned child processes and schemas drained. Before/after provenance matches. Primary execution, cleanup, NuGet verification and npm verification all passed.
- The runner and detached producer trees were clean before and after execution. All 30 recorded runner source hashes, Playwright configuration and live specification matched the committed runner. The audit independently rehashed 19 npm consumer sources and 17 bundles and verified published module origins.
- Ten retained files total 143,725 bytes, with no raw provider logs, screenshots, videos, traces or symlinks. The separate full/half-key fragment scan found zero matches. Diagnostics contain closed, bounded facts rather than raw model content.

The retained aggregate usage is 9,291 input and 1,287 output tokens. These are reported usage facts, not complete billing totals: general scenarios retain aggregate usage, while native approval additionally retains explicit completeness counts. Raw provider payloads are deliberately absent; native result/history/approval relationships are checked in memory and projected into bounded proof facts.

## Package identity and reproduction

The actual signed NuGet archive SHA256 is `288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57`; its loaded DLL SHA256 is `37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2`. A fresh download from official NuGet.org matched the selected archive. Signed and qualified payload entries match except the NuGet repository signature. The original immutable package publication and verification are in [the NuGet publisher run](https://github.com/liveloveapp/hashbrown/actions/runs/41238997643).

The read-only anchored descriptor is prepared from the exact public producer checkout and the qualified unsigned artifact/symbols plus signed public archive. Current runner code wraps its unchanged fixture/probe roles; it never overlays a workspace implementation or repacks during live execution. The internal [conformance README](../../../tools/conformance/dotnet/README.md#opt-in-published-client-live-qualification) documents explicit opt-in, isolated published npm preparation, required NuGet metadata, credentials by path and the selected existing Azure CLI profile. The machine-readable [qualification facts](./2026-10-31-dotnet-public-live-qualification.json) retain safe counts and evidence digests without local credential paths.

Local validation also passed: 545 conformance tests across 54 suites, final targeted launcher/reader/coordinator regressions, conformance build and lint, website build/test/lint, and 32 exact documentation programs compiled against the public NuGet package. Tests reproduced and fixed missing cleanup configuration, lost cleanup failures, in-flight shutdown ordering and descriptor-replacement races before this live run. Production runtime/provider/model deadlines were unchanged.

## Scope

This result does not qualify Azure-hosted managed identity, pending-browser cold recovery, reasoning/continuation recovery, provider-hosted tools, general conversation persistence, .NET 8/9 or mixed-version rolling upgrades. Existing supported recovery and confirmation scenarios are not evidence of cold restoration of unresolved browser work. Managed identity on a real Azure host remains the explicitly deferred follow-up.
