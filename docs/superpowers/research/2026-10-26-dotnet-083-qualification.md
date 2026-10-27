# Published SDK 0.8.3 .NET qualification

Published-package qualification: passed. This record captures local acceptance before integration; final CI links and merged-tree verification will be recorded in the associated pull request after integration.

This follows the completed [0.8.2 qualification and Azure identity work](https://github.com/liveloveapp/hashbrown/pull/779) and [deployment repair](https://github.com/liveloveapp/hashbrown/pull/783). Public npm lists core, React and Angular 0.8.3 with release git head `a244178008d8a75018bdcaa1960ad26b3156168d`. The qualification branch began at main `d1154559`.

## Scope and dependency delta

Only the three existing SDK pins move from 0.8.2 to 0.8.3. The standalone lock retains 353 package entries, with no additions, removals, transitive updates or framework/build-tool version changes. Root pins and the three SDK records change version, registry tarball URL, integrity, and matching React/Angular core peer pins. Historical diagnostic support still begins at 0.8.2; that minimum and prior evidence are preserved.

Acceptance tests first demonstrated that the old validator rejected 0.8.3 and accepted the obsolete qualification baseline. After the validator update, tests require exact 0.8.3 and reject 0.8.2, ranges, local substitutions and overrides. Adversarial installed/lock version fixtures retain distinct mismatches. Independent review approved the five-file implementation.

The native fixture and allowlisted ordinary browser sources are unchanged from the previously qualified revision. The consumer is a fresh physical npm install outside repository ancestry. Registry SRI, installed identities, source/template/bundle hashes and both builders' real module origins are recorded. Each framework build resolves 128 SDK modules within its isolated install. Existing provenance and read-only requalification checks are unchanged.

## Local acceptance

- 248 .NET conformance tests / 26 suites passed. Locked native build and both TypeScript configurations passed; C# emitted zero warnings/errors.
- All 16 exact recipe combinations compiled; formatting verification passed.
- Conformance build, 101 tests / 16 suites and lint passed; lint reported zero issues.
- npm lock regeneration reported nine dependency advisories (one low, eight high). No audit fix or dependency expansion was performed. Existing Nx/Jest deprecation and color-environment warnings remain.

## Browser qualification

The existing eight-project matrix covers React/Angular × OpenAI/Azure × Chat Completions/Responses, with 45 cases per project. The bounded live runner covers six projects: React/Angular × OpenAI Responses key/Azure Responses key/Azure Responses CLI, with seven groups per project and three mandatory native preflights.

Both runs must use the same integrity-checked consumer. Deterministic results require zero skips, retries or flaky outcomes. Live qualification requires 42 distinct passed browser groups and their native proof records, plus all three preflights. Its existing opt-in, 87-call reservation/128-call maximum per run, native output caps, deadlines, process cleanup and pre-persistence diagnostic restrictions remain unchanged. Failures are retained rather than automatically retried until success.

Actual Azure-hosted managed identity remains explicitly deferred. No new SDK release, NuGet distribution, release safeguards or cloud provisioning forms part of this qualification.

The published deterministic run passed **360/360 cases** in **11.8 minutes**, exactly 45 per project, with zero skips, retries or flaky results.

The first bounded live run passed **42/42 distinct browser groups**, **42 native proof records** and **three preflights** in **2.5 minutes**. The consumer provenance copy is byte-identical to the metadata used by the deterministic run. Each of the six projects passed seven groups.

| Measured live result | Value |
| --- | ---: |
| Native requests / HTTP 200 statuses | 63 / 63 |
| Maximum requested output tokens per call | 384 |
| Native cancellations followed by fresh success | 6 |
| Protected effect executions / server tool executions | 6 / 6 |
| Reported input / output tokens | 4,941 / 642 |
| Safe diagnostic report bytes | 38,390 |

Cancelled streams do not report complete provider usage; the reported token count is incomplete accounting. No automatic retries or additional live invocations were used. No provider credentials, raw model bodies, browser traces, screenshots or raw exception/log artifacts were persisted by the live runner.

Retained private evidence includes the registry/consumer provenance, complete Playwright result tree, deterministic summary, projected live JSONL/native proofs, live summary and all build/test/lint logs. Public records omit local credential paths and private resource identities.
