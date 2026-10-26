# .NET Azure identity and live qualification validation

Date: 2026-10-26. Status: live and published-package qualification passed; local checks and final review passed; PR/main verification pending.

This records the bounded follow-up to [Responses PR #770](https://github.com/liveloveapp/hashbrown/pull/770), merged as `d9d501b9e25cda9d1e70e6f00332eb9fba96c78c`. Its main CI run `40374162495` passed the 360-case deterministic matrix; production guides and syntax highlighting were verified. Those results belong to the Responses baseline, not the final follow-up revision.

The approved [design](../specs/2026-10-26-dotnet-entra-live-design.md) and [plan](../plans/2026-10-26-dotnet-entra-live.md) define explicit API-key, Azure CLI and managed-identity selection. Real service qualification here covers OpenAI Responses API key, Azure Responses API key, and Azure Responses Azure CLI. The user explicitly deferred real Azure-hosted managed identity; no provisioning or role changes were needed.

## Versions and provenance

| Dependency/runtime                           | Recorded version                 |
| -------------------------------------------- | -------------------------------- |
| .NET SDK / PostgreSQL                        | 10.0.402 / 18                    |
| Microsoft Agent Framework / hosting preview  | 1.26.0 / 1.26.0-preview.261023.1 |
| AG-UI / Microsoft.Extensions.AI.OpenAI       | 1.0.1 / 10.10.1                  |
| OpenAI / Azure.AI.OpenAI                     | 2.14.0 / 2.1.0                   |
| Azure.Core / Npgsql                          | 1.63.0 / 10.0.3                  |
| Locked System.ClientModel                    | 1.16.0                           |
| Published Hashbrown core, React and Angular  | 0.8.2 each                       |
| Consumer React / Angular / TypeScript / Vite | 19.3.1 / 22.2.3 / 6.0.3 / 8.3.4  |

Azure.Core 1.63.0 and the standalone consumer dependencies were explicitly approved. Transitive lock changes, including System.ClientModel 1.16, were reviewed. No SDK version bump, npm release, NuGet distribution, release safeguard change or upstream report forms part of this work.

The browsers consumed physical registry installs in a fresh standalone temporary directory. `consumer-metadata.json` records registry tarballs/SRI, install command and lock SHA-256, 19 allowlisted current source-file hashes, four template hashes and built artifact hashes. Both framework builds recorded 124 Hashbrown module origins from their isolated `node_modules`. Every resolved real path was inspected before filtering SDK modules. SDK source copying, repository aliases and local vision hosts were excluded.

Requalification reads trusted metadata without rewriting it. A repeated-tamper regression prevents an unsuccessful check from laundering changed artifacts into a new baseline. Registry integrity, installation evidence, source/template hashes and bundle resolution are complementary evidence; package filenames alone do not establish executable provenance.

## Native authentication evidence and limits

Deterministic probes exercise actual factory-created SDK clients, trusted configuration validation, exact credential selection, keyless identity modes, no fallback, fixed scopes, native paths/bearer headers, schema/tool continuation, configuration identity compatibility and same-client token A/B reacquisition. A logical HTTPS transport forwards below SDK authentication policy to a loopback fixture; production TLS defaults are unchanged.

Real preflights returned HTTP 200 for OpenAI Responses with an API key, Azure Responses with an API key, and Azure CLI Chat Completions using `https://cognitiveservices.azure.com/.default`. The live Azure CLI Responses browser projects used `https://ai.azure.com/.default`. All real model calls used the explicitly selected `gpt-4.1-mini` baseline.

Managed-identity construction is tested deterministically. No App Service identity protocol emulator or real managed-identity host was run; construction evidence does not qualify token acquisition, an identity assignment, resource permissions or a deployed host. Actual Azure-hosted managed identity remains a documented follow-up.

Native AzureOpenAIClient 2.1.0 shares legacy token refresh. A cancelled caller cannot preempt shared acquisition, and a pre-cancelled caller can initiate acquisition; tests require no model HTTP dispatch and explicitly drain fake credential work. Azure CLI's ten-second `ProcessTimeout` bounds its subprocess, not the entire request. The native SDK architecture is preserved. Responses acquisition cancellation is tested separately.

## Successful bounded live run

Run 4 passed all 42 distinct browser outcomes and all 42 mandatory native proof records, with three successful native preflights. Exit status was zero.

| Project                       | Passed groups |
| ----------------------------- | ------------: |
| React, OpenAI Responses key   |             7 |
| React, Azure Responses key    |             7 |
| React, Azure Responses CLI    |             7 |
| Angular, OpenAI Responses key |             7 |
| Angular, Azure Responses key  |             7 |
| Angular, Azure Responses CLI  |             7 |

Each project covered streaming plain output, structured schema, trusted UI/action, browser tool, server tool, approval/resume and decline, and cancellation followed by a successful fresh thread. Assertions checked contracts, ownership, effects and lifecycle rather than exact model prose.

| Measured result                                         |       Run 4 |
| ------------------------------------------------------- | ----------: |
| Native model requests, including preflights             |          63 |
| Native HTTP 200 statuses                                |          63 |
| Maximum requested output tokens per native call         |         384 |
| Actual native cancellations followed by fresh success   |           6 |
| Server lookup tool executions                           |           6 |
| Protected effect executions                             |           6 |
| Reported input / output tokens                          | 4,941 / 636 |
| Safe JSONL report bytes                                 |      38,390 |
| Cumulative cloud requests across all four recorded runs |         192 |

Cancelled streams do not report complete provider usage. Reported tokens are incomplete accounting, not zero cancelled-stream billing. Native iterator/HTTP cancellation also does not establish when a provider stops compute or billing.

The run used one worker and zero native or Playwright retries. Immutable ceilings reserve at most 14 calls per project plus three preflights (87 total), within the independent 128-call maximum. Groups allow at most four calls, with 384 requested output tokens per call, 60-second scenario deadlines and a 15-minute run deadline. Failed/cancelled/continuation calls consume the same budgets. Owned process groups, including descendants surviving direct-parent exit, are terminated on abort. Test-only automatic redirects are disabled to preserve accounting; production TLS defaults are unchanged.

One run-level sink limits diagnostics to 2 MiB. Projection/redaction occurs before persistence; raw child output and exception bodies are discarded. Browser traces, video, screenshots and error-context snapshots are disabled. An actual forced browser failure with a browser-execution witness tested canaries in assertion/error/cause, DOM and split child output; persisted artifacts contained neither canaries nor ErrorContext output. Error names are blanked as well as messages/stacks.

## Earlier runs and concrete corrections

These were separate bounded invocations after specific fixes, with no automatic retry-until-success behavior. Their failures remain part of the evidence.

| Run | Observed result                                                                                                                                                                                         | Correction before a new invocation                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Three native preflights passed; real Node rejected unexported `playwright/cli`. No browser groups ran.                                                                                                  | Resolve the declared public package-manifest binary. Add a real Node-version canary, drop inherited Jest environment and require actual browser-execution evidence so startup failure cannot make the artifact canary pass vacuously. |
| 2   | All 42 UI groups passed; all 63 requests returned HTTP 200. Only 41 native proofs qualified: Angular/OpenAI's fresh post-cancel stream remained incomplete at teardown. Qualification correctly failed. | Replace old idle-state waiting with an exact-count/native-completed barrier, require a fresh empty thread and add withheld-completion coverage.                                                                                       |
| 3   | Strong polling exposed six fresh-after-cancel failures while 36 normal groups passed: status 0 while HTTP headers were pending was parsed as invalid final metadata.                                    | Permit status 0 only for pending metadata; retain final HTTP 200/completion requirements. Add an actual phased-HTTP regression.                                                                                                       |
| 4   | All 42 outcomes, 42 native proofs and three preflights passed.                                                                                                                                          | Successful bounded qualification recorded above.                                                                                                                                                                                      |

## Reproduction and retained evidence

The [runner instructions](../../../tools/conformance/dotnet/README.md#opt-in-published-client-live-qualification) describe credential-free listing and explicit live opt-in. Credentials remain local and authorized; they are excluded from browser/build processes, URLs and bundles. Sanitized artifacts are identified generically as `consumer-metadata.json`, `live-run-4-summary.json`, the run-level JSONL report and native proof ledger. Private paths, keys, profile contents and cloud resource identities are absent here.

```sh
npx nx prepare-live-consumer dotnet-conformance
npx nx live-provider-e2e dotnet-conformance --list
npx nx build dotnet-conformance
HASHBROWN_LIVE_OPT_IN=1 npx nx live-provider-e2e dotnet-conformance --credentials /path/to/authorized.env
```

The last command makes real service calls and is never a default CI dependency. A prepared consumer can be supplied with `--consumer-metadata /path/to/consumer-metadata.json`; its provenance is revalidated before use. Missing prerequisites fail qualification instead of producing passing skips.

## Final local acceptance

- **360/360 published-client deterministic cases passed** in 12.0 minutes: 45 per React/Angular × OpenAI/Azure × Chat Completions/Responses project; zero skips, retries or flaky results. Current .NET code ran against the same physical npm 0.8.2 consumer used for the successful live run.
- **247 .NET tests / 26 suites passed**, with locked native build, both TypeScript checks and format verification. C# emitted zero warnings/errors. The exact four C# blocks and nine dependency pins in both guides compiled in **16 recipe combinations**.
- Conformance build and **101 JavaScript tests / 16 suites passed**. All introduced ESLint errors and warnings were resolved; final conformance lint reported zero issues.
- Docs build, **1,018 tests / 145 files**, lint, route report and workbench browser checks passed. Both local .NET guides retain four C# blocks with 5–7 syntax colors and one XML block with four colors.
- Every component received specification and quality review. The final combined review found no actionable issue; subsequent startup, completion, pending-status and lint corrections received focused independent reviews.
- A fresh post-lint consumer independently rehashed **all 16 served JS/CSS/HTML artifacts as byte-identical** to the executed consumer. Only Angular source/template import-member ordering changed; package identities and executable bytes did not.

Existing Nx executor deprecations, NO_COLOR/FORCE_COLOR notices, API Extractor forgotten-export advisories and Vite chunk-size warnings remain visible. They are not introduced .NET compiler or conformance lint failures.

Required PR CI, green merge, merged-tree comparison and production verification remain to be recorded on the follow-up PR. No additional SDK publication is authorized or needed.
