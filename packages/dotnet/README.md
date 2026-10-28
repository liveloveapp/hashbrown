# Hashbrown.AspNetCore

One maintained ASP.NET Core library for Hashbrown generative UI, targeting .NET 10
(SDK 10.0.402), with namespace `Hashbrown.AspNetCore`.

Version `0.1.0-preview.1` produces a release-ready local `.nupkg` and `.snupkg`.
It is **not published to NuGet.org**. Place the qualified `.nupkg` in an owned local
feed, map `Hashbrown.AspNetCore` exclusively to that feed, and map dependencies to
an approved upstream feed. Use one exact reference:

```xml
<PackageReference Include="Hashbrown.AspNetCore" Version="[0.1.0-preview.1]" />
```

Restore with an explicit `NuGet.Config`, commit the generated lockfile, then use
`dotnet restore --configfile NuGet.Config --locked-mode`. Dependencies are carried
by the package nuspec. Application code uses `using Hashbrown.AspNetCore;`.
The composition APIs configure providers, endpoints and stores; the public low-level
store SPI supports application-owned storage integrations.

Applications own authentication, authorization, provider configuration and secrets,
and PostgreSQL provisioning, credentials and permissions. Remove copied Integration
source and old namespace imports when migrating. Stop and drain old workers before
upgrading; retain agent, catalog, scope and server configuration identities.
Workflow schema 3 and native schema 2 remain independent from package versions.
Recovery lookup performs no model or executor work. Pending mixed browser work cannot
cold restore; there is no automatic effect retry, exactly-once external-effect claim,
or mixed-version rolling-operation guarantee.

The 54 live-provider cases recorded on 2026-10-27 are historical source-integration
evidence, not live NuGet qualification. Read current package acceptance evidence
separately. See https://hashbrown.dev/docs/react/platform/dotnet for the recipe.

Licensed under the MIT license.
