# .NET provider conformance

Internal test infrastructure for the documented AG-UI integration. The actual
ASP.NET Core endpoint, Microsoft Agent Framework, AG-UI serializer, and native
OpenAI/Azure clients run against strict aimock fixtures. Both React and Angular
consume the endpoint's real SSE stream. Model API requests are captured before
aimock normalization, with credentials reduced to their authentication type.

## Prerequisites and commands

Install the exact SDK from `global.json`, run the repository's `npm ci`, and put
`dotnet` on PATH. An isolated SDK can instead be selected with `DOTNET_HOST_PATH`
for the process harness; the Nx build still resolves `dotnet` from PATH.

```sh
npx nx build dotnet-conformance
npx nx test dotnet-conformance
npx nx lint dotnet-conformance
npx nx provider-e2e dotnet-conformance
```

The build restores with `--locked-mode`. Only deliberate dependency updates use
`npx nx restore-lock dotnet-conformance`, followed by review of `packages.lock.json`.
No live model credentials or account are needed. OpenAI uses a public model name;
Azure uses a separate deployment name and its genuine deployment URL/API-key wire.

The browser matrix uses ports 4431 (Angular) and 4432 (React). The native model
fixture, capture proxy, and .NET server use dynamic loopback ports. Reports and
traces are under `test-results/conformance/dotnet` and
`playwright-report/conformance/dotnet`. Failed fixtures preserve bounded process
logs and native model request evidence under the test-results diagnostics folder.

## Reference source

`Integration/` contains the recipe's reusable C# source. `Testing/`, `Program.cs`,
and the TypeScript harness are test infrastructure. Never copy the fixture's
header-based test identities, test controls, or localhost model setup into an
application. Applications supply authentication, authorization, tool permissions,
model configuration, and their own server-owned workflow checkpoint selector.

`HashbrownRequestClient` enables strict native JSON schema output and fails a
single model turn combining browser and server tool calls before server effects.
Sequential mixed workflows use the upstream agent pipeline. `InterruptWorkflowClient`
handles explicit application confirmation; it does not claim automatic native
MAF approval-tool compatibility. The native interrupt serializer registration is
required by the pinned hosting baseline.

`PendingInterruptStore` binds a full confirmation batch to principal, thread,
conversation/tool/schema fingerprint, stored operation, and expiry. Execution
claims are atomic: cancellation before effects permits retry; after effects begin,
consumption stays conservative. Consumed markers remain until expiry: retrying an ambiguous result never repeats protected work. The
store is bounded and process-local. Production applications needing restart or
multi-instance recovery must provide durable application workflow storage and
appropriate effect idempotency.

## Tested dependency baseline

| Dependency                                  | Version                 |
| ------------------------------------------- | ----------------------- |
| .NET SDK                                    | 10.0.402                |
| Microsoft.Agents.AI.Hosting.AGUI.AspNetCore | 1.26.0-preview.261023.1 |
| Microsoft.Agents.AI                         | 1.26.0                  |
| AGUI.Abstractions / AGUI.Server             | 1.0.1                   |
| Microsoft.Extensions.AI.OpenAI              | 10.10.1                 |
| OpenAI                                      | 2.14.0                  |
| Azure.AI.OpenAI                             | 2.1.0                   |

The selected model wire is Chat Completions. Responses-backed .NET clients,
Entra authentication, older .NET runtimes, durable workflow recovery, reasoning,
activities, shared state, and provider finish-reason metadata are not included in
this initial compatibility guarantee. Hashbrown's existing Node providers keep
their own behavior and tests.
