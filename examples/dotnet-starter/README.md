# .NET starter: React or Angular, one native server

This public example runs a real ASP.NET Core server with PostgreSQL native-session
storage and either a React or Angular client served from the same origin. The
server references `Hashbrown.AspNetCore` **exactly `0.1.0-preview.2`**; clients
reference the **`0.9.0`** npm packages. These versions are upcoming and are not
claimed to be available on public registries. Use the explicit local candidate
workflow below until publication. Nothing in these commands publishes a package.

The example demonstrates a read-only .NET `lookupAirport` function with genuine
native approval, a browser `readBrowserNote` tool, explicit interruption, cold
recovery, complete browser-result/approval settlement, and a new conversation.
Messages, arguments and recovery diagnostics render as escaped ordinary text.

## Requirements and candidate setup

Use Node/npm from this repository, .NET SDK `10.0.402` with latest patch in that
feature band (`global.json`), a running PostgreSQL database, and the existing
repository dependencies (`npm ci`). No additional dependency is required.
Preparation uses the retained pinned third-party graph, its integrity values, and
fresh caches. The repository root controls Nx commands; generated applications
and their package installations live in a fresh external temporary directory.

First prepare and qualify the current npm and NuGet candidates using the
[conformance candidate instructions](../../tools/conformance/dotnet/README.md).
Then pass both **absolute, qualified candidate pointer paths** explicitly:

```sh
npx nx prepare-candidate dotnet-starter --npm=/absolute/npm-candidate.json --nuget=/absolute/nuget-candidate.json --metadata=/absolute/new-starter.json
npx nx build dotnet-starter --metadata=/absolute/new-starter.json
npx nx test dotnet-starter --metadata=/absolute/new-starter.json
npx nx lint dotnet-starter
npx nx lint-candidate dotnet-starter --metadata=/absolute/new-starter.json
```

The metadata pointer must be new. Preparation never overwrites an existing
selection. It copies exact archives to its own npm archives and mapped NuGet
feeds, installs with empty npm configuration and a fresh NuGet cache, performs
locked restore, builds both clients and the actual server, and records source,
installation, archive and output identities. The public manifest retains exact
intended registry versions; the external candidate manifest explicitly selects
copied `file:` archives. Neither path falls back to workspace source, an arbitrary
DLL, a ProjectReference, a registry version range, or `latest`.

Ordinary `lint` always checks repository ESLint/Prettier sources without package preparation. `lint-candidate` additionally qualifies the explicit prepared selection and verifies .NET formatting. Build and test accept either `--metadata` or the explicitly set `HASHBROWN_STARTER_METADATA`; serve requires the CLI selection and never prepares implicitly.

Verification runs again before and after candidate commands. Changed starter or package
sources require fresh candidate qualification/preparation; an old receipt cannot
qualify changed bytes. Candidate origin is recorded honestly and is never labeled
as a public-registry installation. Metadata and logs are in the owned output
reported as `STARTER_ROOT`; they do not contain provider credentials or raw model
transcripts. Keep database connection strings and keys in your shell or secret
manager, outside this source tree.

## Run one framework

Configure the server, including an explicit local identity opt-in:

```sh
export ASPNETCORE_ENVIRONMENT=Development
export DevelopmentIdentityEnabled=true
export LocalOrigin=http://127.0.0.1:5190
export ConnectionStrings__NativeJournal='Host=127.0.0.1;Database=hashbrown;Username=postgres;Password=your-local-password'
export Provider=openai
export ModelEndpoint=https://api.openai.com/v1/
export Model=gpt-4.1-mini
export OPENAI_API_KEY='your-server-only-key'
npx nx serve dotnet-starter --metadata=/absolute/new-starter.json --framework=react
```

Open [the local starter](http://127.0.0.1:5190). Stop it before selecting Angular:

```sh
npx nx serve dotnet-starter --metadata=/absolute/new-starter.json --framework=angular
```

`ClientRoot` is selected by the runner from the verified physical built directory.
The server's `/health` is ready only after the PostgreSQL journal initializes.
There is no memory-store fallback and no cross-origin browser API configuration.

Responses is the explicit startup default (`ModelApi=responses`). For Azure API
keys, set `Provider=azure`, `ModelEndpoint` to your Azure resource origin, `Model`
to the **deployment name**, and `AZURE_OPENAI_API_KEY`; the package expands the
resource origin for Responses. An explicit `ApiKey` overrides the provider-specific
environment key. For supported Azure CLI development authentication, explicitly
set `AzureAuthentication=azure-cli` and an HTTPS Azure endpoint. This mode does
not fall back to an API key when identity fails. Provider/deployment/endpoint and
credentials are server configuration, never frontend build variables. This
starter adds no new managed-identity or runtime-support claim.

## Try the workflow and cold recovery

1. Ask to look up SFO and read the browser note. The native tool requests a genuine
   approval. Approve, decline, or cancel the **whole** displayed decision batch.
   The browser read waits until you explicitly release its result.
2. Use **Interrupt running work** to cancel the active interaction. Interruption
   is a request cancellation, not proof that an external effect did not occur.
3. To explore cold recovery, retain the URL's `threadId`, stop the first server,
   and restart the same compatible app/catalog/configuration against the same
   PostgreSQL schema. Reload the page and choose **Recover this conversation**.
   Recovery reads durable V2 state and restores history without calling the model
   or rerunning the original browser handler.
4. For recovered browser calls, supply each result already known by your
   application, or select **Result unavailable; do not replay**. Submit all browser
   outcomes and protected decisions together. An unavailable result records
   uncertainty; it does not grant authority to retry an external operation.
5. Read diagnostics as history, then use **New conversation** when you want a
   fresh public selector and runtime. This does not erase old durable records or
   their effect/decision fences.

`Busy`, `UnknownEffect`, `Expired` and unavailable dispositions do not authorize
continuation. Resolve uncertainty through application-owned operational processes;
the starter deliberately exposes no privileged operator/reconciliation endpoint.
Production applications own authorization, downstream idempotency and independent
external-effect evidence. Approval is a workflow decision, not a substitute for
permission to access protected application data.

## Local identity and production integration

Local identity is disabled by default and requires both an explicit opt-in and
`Development`. The server fixes identity and scope; a thread selector and caller
scope headers cannot choose authority. Requests must come directly from a
loopback peer with the configured exact Host and safe Origin. Forwarded headers
are not trusted. No-Origin unsafe local CLI requests require
`Hashbrown-Starter: starter`; browser requests use the same origin. There is no
permissive CORS policy. Bind to a single explicit loopback origin.

Outside Development the application refuses startup with an actionable error.
Before deploying, replace the local authentication handler and startup refusal
with your actual authentication and authorization integration. Retain the trusted
scope resolver, use authenticated application claims, and apply application
permissions inside your tools. Do not enable this development identity in
production or equate local approval with production permission.

## Maintenance belongs to the application

[NativeMaintenanceService.cs](server/NativeMaintenanceService.cs) receives the same
`StarterNativeRegistration` journal/catalog/options used by `/run` and recovery.
Every ten seconds it awaits one `MaintainAsync` pass, bounded to 100 sessions by
`NativeSessionOptions.MaintenanceBatch`, with host cancellation and a five-second
pass deadline. It observes completion counts, timeout or failure using only safe
facts. A full batch does not trigger an unbounded drain loop. Maintenance does not
call the model, execute tools, retry effects, or extend private retention.

When hosting multiple compatible agent/catalog/configuration registrations,
register a `StarterNativeRegistration` for each exact journal. The background
service schedules every registration; do not construct an unrelated default
journal for maintenance. Scheduling and backlog determine recovery latency.
This is the native journal, distinct from an application workflow checkpoint
store and its `PostgresInterruptCleanupService`.

## Real smoke and qualification

After preparation, provide a dedicated local test PostgreSQL connection:

```sh
export DOTNET_TEST_POSTGRES='Host=127.0.0.1;Database=hashbrown_test;Username=postgres;Password=your-local-password'
npx nx smoke dotnet-starter --metadata=/absolute/new-starter.json
```

The smoke launches the actual built server and installed React and Angular
clients against a separate strict Responses HTTP service. No provider key or
external model call is needed. It checks startup/authentication refusals, native
approval/decline, browser tools, interruption, pending mixed work, a drained first
worker and distinct replacement worker, V2 restore, known/unavailable complete
settlement, actual subsequent provider call/result identities, no browser/native
replay, inert Completed reads, and actual application loaded-SDK hashes. The
BCL-only test console inspects counts and cleans only freshly generated owned
`starter_smoke_<random>` schemas after the workers stop. It never drops your normal
`NativeSchema`. The smoke receipt is stored in owned `logs/starter-smoke.json`;
its existence is not a claim that your current sources passed until you run it.

After the coordinated release is actually published, normal exact registry
restore/install instructions can use the committed public versions. Public
registry integrity/signature receipts must then be qualified separately; local
candidate receipts cannot prove registry publication. Until then use the
candidate workflow above.
