# Hashbrown.AspNetCore

One maintained ASP.NET Core library for Hashbrown generative UI, targeting .NET 10
(SDK 10.0.402), with namespace `Hashbrown.AspNetCore`.

## Install the coordinated release

This package README accompanies `0.1.0-preview.2`, paired with npm core and
React/Angular `0.9.0`. Once coordinated publication is complete and both registry
versions have been verified, install the exact release from NuGet.org:

```sh
dotnet add package Hashbrown.AspNetCore --version "[0.1.0-preview.2]" --source https://api.nuget.org/v3/index.json
dotnet restore --source https://api.nuget.org/v3/index.json --use-lock-file
dotnet restore --source https://api.nuget.org/v3/index.json --locked-mode
```

Use one exact reference and commit the generated lockfile:

```xml
<PackageReference Include="Hashbrown.AspNetCore" Version="[0.1.0-preview.2]" />
```

Until coordinated publication, use explicitly qualified local candidate archives.
Do not infer publication from this README or a local package version. The historical
published pair is NuGet `0.1.0-preview.1` and npm `0.8.3`; that pair does not expose
the V2 browser settlement APIs described below. The website installation guides
retain its preview.1 commands until both new releases are published and verified.

When testing an unpublished CI candidate, place its qualified `.nupkg` in an owned
local feed, map `Hashbrown.AspNetCore` exclusively to that feed, map dependencies
to an approved upstream feed, and restore using an explicit `NuGet.Config`. This
local candidate workflow does not establish NuGet.org publication.

Dependencies are carried by the package nuspec. Application code uses
`using Hashbrown.AspNetCore;`.
The composition APIs configure providers, endpoints and stores; the public low-level
store SPI supports application-owned storage integrations.

Applications own authentication, authorization, provider configuration and secrets,
and PostgreSQL provisioning, credentials and permissions. Remove copied Integration
source and old namespace imports when migrating. Stop and drain old workers before
upgrading; retain agent, catalog, scope and server configuration identities.
Workflow schema 3 and native schema 2 remain independent from package versions.
Recovery lookup performs no model or executor work. Published `0.1.0-preview.1`
with npm SDKs `0.8.3` cannot cold-restore unresolved browser work. There is no
automatic effect retry, exactly-once external-effect claim or mixed-version
rolling-operation guarantee.

The preview.2 release adds V2 native recovery through the optional
`INativeSessionBrowserRecoveryJournal` contract. PostgreSQL implements that
capability; custom journals must opt in explicitly. Matching npm 0.9.0 clients
expose `pendingConversationRecovery` and `resumeConversationRecovery` for one
complete explicit settlement of known/unavailable browser observations and
genuine protected decisions. Reads and restoration remain inert. Ambiguous
delivery or a revision conflict requires an authoritative fresh read. These APIs
are absent from the historical preview.1 / 0.8.3 pair above.

In the preview.2 PostgreSQL implementation, application-scheduled `MaintainAsync`
also reconciles expired request authority under the same bounded budget as privacy
purges. It counts distinct sessions actually changed. Schedule maintenance for
every compatible registration; custom journals do not inherit that behavior.
Consumed-decision and dispatch fences remain, and uncertainty never authorizes
redispatch.

The 54 live-provider cases recorded on 2026-10-27 remain historical source
evidence. Separate [published-package live qualification](https://github.com/liveloveapp/hashbrown/blob/main/docs/superpowers/research/2026-10-31-dotnet-public-live-qualification.md)
on 2026-10-31 passed 54 browser cases using official NuGet `0.1.0-preview.1` and
npm `0.8.3` against real OpenAI/Azure Responses, plus three preflights and 93
model/wire calls. That historical evidence is distinct from the separately recorded
[durability and compatibility checkpoint](https://github.com/liveloveapp/hashbrown/blob/main/docs/superpowers/research/2026-11-01-dotnet-browser-durability-qualification.md)
and candidate browser acceptance. See the [React native recipe](https://hashbrown.dev/docs/react/platform/dotnet-native-tools)
or [Angular native recipe](https://hashbrown.dev/docs/angular/platform/dotnet-native-tools)
for version boundaries and application responsibilities.

Start from the [runnable ASP.NET Core starter](https://github.com/liveloveapp/hashbrown/tree/main/examples/dotnet-starter),
including both clients and its [bounded maintenance service](https://github.com/liveloveapp/hashbrown/blob/main/examples/dotnet-starter/server/NativeMaintenanceService.cs).
The mirrored [React](https://hashbrown.dev/docs/react/platform/dotnet-starter) and
[Angular](https://hashbrown.dev/docs/angular/platform/dotnet-starter) guides compare
application workflow stores with native journals and explain stopped-worker upgrades.
Browse the generated [C# API reference](https://hashbrown.dev/api/dotnet/Hashbrown.AspNetCore.NativeSessionAgentFactory).

Development identity is explicitly enabled only on loopback in Development.
Production requires application authentication and authorization. Cloud-hosted
managed identity qualification, .NET 8/9 and rolling upgrades remain follow-ups.

Licensed under the MIT license.
