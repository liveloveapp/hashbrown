---
title: 'ASP.NET Core starter: Hashbrown React Docs'
meta:
  - name: description
    content: 'Run a same-origin React or Angular client with a durable native .NET tool server and explicit recovery.'
---

# ASP.NET Core starter

<hb-docs-demo demo="canonical-workbench-interrupts-react">
</hb-docs-demo>

This recorded teaser is a client replay of interrupt controls and explicit continuation in the workbench. It does not run the ASP.NET Core starter, native .NET approvals or PostgreSQL session ownership. Run the separate application below to explore those server responsibilities.

<hb-diagram diagram="dotnet-agent-boundary">
</hb-diagram>

The [runnable starter source](https://github.com/liveloveapp/hashbrown/tree/main/examples/dotnet-starter) contains a real ASP.NET Core server and both React and Angular clients. It demonstrates a browser tool, an approved read-only airport lookup in .NET, explicit interrupt/resume, authoritative recovery diagnostics, complete cold settlement and an explicit new conversation action.

The starter targets upcoming npm `0.9.0` and NuGet `0.1.0-preview.2`. These versions are **unreleased**; a local candidate run does not establish registry publication or live-provider qualification. The [starter README](https://github.com/liveloveapp/hashbrown/blob/main/examples/dotnet-starter/README.md) supplies the exact preparation, run and verification commands for both clients. Use its explicitly selected archive consumers until both registries contain the coordinated pair. Do not substitute workspace source, a ProjectReference, arbitrary DLLs, version ranges or `latest`.

## Choose the composition

| Requirement                                                                                    | Composition                                                        | Store and maintenance                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate browser/server model turns; application-defined confirmation operations               | [Stateless and application workflows](/docs/react/platform/dotnet) | `IInterruptStore`: `PendingInterruptStore` is single-process development storage; `PostgresInterruptStore` is durable. Application owns operation registry, initialization and bounded cleanup scheduling. |
| Browser and .NET tools in one response; genuine MAF approvals; native pending-session recovery | [Native mixed tools](/docs/react/platform/dotnet-native-tools)     | `INativeSessionJournal`: the starter uses `PostgresNativeSessionJournal`. Application owns initialization and bounded `MaintainAsync` scheduling for every compatible registration.                        |

The stores serve different protocols. Application workflow checkpoints do not replace native session ownership, and an approval decision does not grant application permission to perform an operation.

## Published and upcoming compatibility

Install matching core and framework versions together. Database schema versions and recovery protocol versions are independent of package versions.

| npm core + React/Angular                | Hashbrown.AspNetCore | Availability and recovery boundary                                                                                                                                                                                      |
| --------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.8.3`                                 | `0.1.0-preview.1`    | Published baseline. Completed and native-only pending approval snapshots can restore. Unresolved browser work, including a mixed pending sibling, has no adoptable cold snapshot.                                       |
| `0.9.0`                                 | `0.1.0-preview.2`    | Upcoming, unreleased coordinated pair. V2-capable native journals support explicit cold browser settlement through `pendingConversationRecovery` and `resumeConversationRecovery`; lookup and restoration remain inert. |
| Mixed versions or older custom journals | Any                  | No new cross-version recovery guarantee. Do not infer V2 continuation support from a version label or capability advertisement alone.                                                                                   |

The current published installation instructions on the [stateless](/docs/react/platform/dotnet#server-dependencies) and [native](/docs/react/platform/dotnet-native-tools#install-the-pinned-preview-from-nuget.org) guides intentionally retain preview.1. Only after npm `0.9.0` and NuGet preview.2 are both published and verified should those commands, exact PackageReferences and matching npm installation pins change. Local candidate compilation against preview.2 does not change that boundary.

## Run the starter

Use the pinned .NET 10 SDK feature band (`10.0.402`, latest patch policy), the repository's pinned Node version, and PostgreSQL 18 with schema/table creation and cleanup permissions. Prepare the qualified npm and NuGet archives using the starter README, retain their absolute metadata pointers, then build the selected React or Angular client. The server serves that built client from the same origin; provider credentials never belong in frontend configuration or client artifacts.

From the repository root, select both qualified archive pointers and a fresh physical output pointer explicitly:

```sh
candidate_dir=$(cd "$(mktemp -d)" && pwd -P)
npx nx prepare-candidate dotnet-starter --npm=/absolute/npm-candidate.json --nuget=/absolute/nuget-candidate.json --metadata="$candidate_dir/starter.json"
npx nx build dotnet-starter --metadata="$candidate_dir/starter.json"
npx nx test dotnet-starter --metadata="$candidate_dir/starter.json"
npx nx lint dotnet-starter
npx nx lint-candidate dotnet-starter --metadata="$candidate_dir/starter.json"
```

Ordinary lint checks repository sources; `lint-candidate` also qualifies artifacts and checks .NET formatting. Build/test accept an explicit CLI pointer or `HASHBROWN_STARTER_METADATA`. Serve always requires the CLI pointer:

```sh
npx nx serve dotnet-starter --metadata="$candidate_dir/starter.json" --framework=react
```

Stop the server before changing `--framework=react` to `--framework=angular`. Set the server configuration below before serving. For deterministic real-client smoke, set a dedicated `DOTNET_TEST_POSTGRES` connection and run `npx nx smoke dotnet-starter --metadata="$candidate_dir/starter.json"`. These are commands to execute, not claims that your selection has passed.

The server configuration is application-owned:

| Setting                                                                 | Purpose                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Provider`                                                              | `openai` or `azure`                                                               |
| `ModelApi`                                                              | Explicit startup default `responses`; select `chat-completions` only deliberately |
| `ModelEndpoint`, `Model`                                                | Provider endpoint and model name, or Azure deployment name                        |
| `ApiKey` / provider environment secret                                  | Server-only key; Azure identity modes follow the provider guide                   |
| `ConnectionStrings__NativeJournal`                                      | Real PostgreSQL journal connection                                                |
| `ClientRoot`                                                            | Built React or Angular output selected by the prepared consumer                   |
| `LocalOrigin`                                                           | Single loopback origin with explicit port, default `http://127.0.0.1:5190`        |
| `ASPNETCORE_ENVIRONMENT=Development`, `DevelopmentIdentityEnabled=true` | Explicit opt-in to the starter's local identity                                   |

The local identity is disabled by default, fixed by the server and limited to Development on loopback. Unsafe Host/Origin values, nonloopback peers and caller-controlled scope are rejected. The starter refuses production startup until you integrate your application's actual authentication and authorization. Do not copy conformance `Testing` authentication or treat a thread selector as access control.

## Maintenance and deployment

The [bounded maintenance service](https://github.com/liveloveapp/hashbrown/blob/main/examples/dotnet-starter/server/NativeMaintenanceService.cs) shares the endpoint's exact journal, catalog, options and agent registration with recovery. Initialization completes before readiness. Each timer tick awaits one bounded pass with host cancellation and a pass deadline; failures and timeouts are observed without private payloads. There is no unbounded drain loop and maintenance never dispatches models or tools.

Schedule every trusted compatible agent/model/catalog registration. A custom journal must explicitly implement `INativeSessionBrowserRecoveryJournal` to support V2 browser recovery and define its own maintenance behavior. PostgreSQL's registration-specific reconciliation is separate from schema-wide privacy purges; retained selector, dispatch and consumed-decision fences survive purge.

Before upgrading, stop and drain old workers and establish quiescence. Retain authenticated scope, agent, catalog and server-configuration identities; initialize/migrate the durable schema before serving traffic. Native schema 2 and workflow schema 3 remain separate. There is no mixed-version rolling-upgrade guarantee. A fresh version cannot stop an old worker that is already running.

## Recover without replaying work

Refresh authoritative state using the unchanged current recovery configuration and V2 negotiation, then restore only a validated compatible snapshot. Complete every browser observation and genuine protected decision in one explicit settlement. Do not rerun original browser handlers, guess unavailable results or split the settlement into partial resumes. Read and restoration perform no provider, executor or handler work. See the [complete native recovery protocol](</docs/react/platform/dotnet-native-tools#pending-browser-recovery-(unreleased)>).

After ambiguous delivery, timeout, disconnect or conflict, refresh instead of resending the old token. An authoritative Completed snapshot can be adopted without another model call. `UnknownEffect` and unavailable browser results record uncertainty; they do not authorize redispatch. Applications own tool permission checks, downstream idempotency and independent outcome evidence. No exactly-once external-effect guarantee is implied. A new conversation is an explicit new identity and does not cancel old work.

## Qualification boundaries

The existing workbench teasers remain client replays and do not run this starter or establish native PostgreSQL behavior. Read actual current command reports for candidate build, browser and live-provider results. The historical published npm `0.8.3` / NuGet preview.1 evidence remains separate from candidate acceptance.

Cloud-hosted managed identity qualification, .NET 8/9 support and mixed-version rolling upgrades remain follow-ups; this starter makes no new support promise for them. For the breaking npm renderer rename, follow [Magic Text to prose](/docs/react/migrations/prose). Browse the [C# factory](/api/dotnet/Hashbrown.AspNetCore.NativeSessionAgentFactory) and [journal](/api/dotnet/Hashbrown.AspNetCore.PostgresNativeSessionJournal) references for signatures and authored API documentation.
