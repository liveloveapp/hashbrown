# Minimal candidate consumer isolation qualification

Executed on 2026-11-01 before feature browser controls. This is an intermediate source-candidate gate, not published feature availability or cold browser journey acceptance. Subsequent executable changes invalidate its source bindings and require fresh preparation.

## Source and artifacts

Base revision: `b47ac1938b398fa93186a967a77b4b074d9f23c8`. Preparation explicitly included uncommitted source; the npm working-tree inventory SHA-256 was `0dd82983c5304c51ba8429709485cfe918bb8522499584444e71324b69fa64e8`.

| Local candidate      | Archive SHA-256                                                    |
| -------------------- | ------------------------------------------------------------------ |
| core                 | `13a5bee2eb55e859165cfbf0e64ace3ae9cf011ea69ef15343fa50ffdc87264a` |
| React                | `c79d235b997135ff479e7718d7a521c081a326b57deac77cd3f21a02121ebacd` |
| Angular              | `8bdc5d8833cdcc13ea41e8bf0cb3e37ba01f0850dd906d29878d9784de60b41d` |
| Hashbrown.AspNetCore | `e4763779ee71bb51710e77afaaaca4803e8badef7c4f008b01d99c8150800904` |

The actual loaded NuGet implementation SHA-256 was `69647b89bbcc62118aff89003c205c4fc0549b7e4a85dcc9611437b812c7aa61`. Its external public smoke passed ordinary and structured output, browser continuation, native approval/decline/cancellation, stale rejection, safe recovery, and one actual protected effect. This smoke does not test pending-browser cold settlement.

Repository versions remained npm `0.8.3` and NuGet `0.1.0-preview.1`; these local archive bytes are separately identified source candidates and were never published or substituted into retained public pointers.

## Executed preparation and controls

Root ran, with Nx options before the strict forwarded pointer arguments:

```sh
npx nx prepare-candidate-npm dotnet-conformance --output-style=static -- --metadata=/private/tmp/hashbrown-dotnet-next/task7-minimal-candidate-npm.json
npx nx prepare-candidate-nuget dotnet-conformance --output-style=static -- --metadata=/private/tmp/hashbrown-dotnet-next/task7-minimal-candidate-nuget.json
npx nx candidate-consumer-check dotnet-conformance --output-style=static -- --npm-metadata=/private/tmp/hashbrown-dotnet-next/task7-minimal-candidate-npm.json --metadata=/private/tmp/hashbrown-dotnet-next/task7-minimal-candidate-nuget.json
```

The npm run completed three producer builds and real tarball packs, a fresh isolated install, strict declaration contracts for six public facade types per framework, separate React/Angular TypeScript checks, actual framework builds, and exact source/build/installed/module-origin qualification. The minimal applications import actual chat facades; this establishes no runtime coverage for the other facade leaves or recovery controls.

Actual isolation evidence recorded 20 unique passed controls:

| Controls                                                                                                   | Count |
| ---------------------------------------------------------------------------------------------------------- | ----- |
| Candidate strict public declaration compilation                                                            | 1     |
| Actual public 0.8.3 core/React/Angular substitutions fail specifically on missing recovery exports/members | 3     |
| Usable cache-only candidate installation, then separate mandatory missing-archive refusal                  | 1     |
| Archive byte tamper and symlink refusal                                                                    | 2     |
| Workspace alias, consumer source symlink, installed SDK symlink refusal                                    | 3     |
| Added nested/root consumer source/config, owned npm config tamper, added producer source refusal           | 6     |
| Descriptor and source-hash tamper refusal                                                                  | 2     |
| NuGet role library and executable substitution refusal                                                     | 2     |

For the cache positive, an owned HTTP endpoint served the exact candidate bytes/SRI into an owned cache. The server stopped and selected sentinel archive was removed before a fresh offline install and strict contract compilation. This is a distinct control manifest, not relaxation of the production candidate's mandatory physical archive check. NuGet preparation separately demonstrated fresh-cache restore rejection with a forbidden same-version cache sentinel.

The first actual installed-lock qualification rejected npm's canonical `file:archives/name.tgz` representation because the selected root lock used `file:/absolute/archives/name.tgz`. A focused test reproduced that mismatch, followed by a minimal reviewed fix accepting only those two exact references to the same normalized declared archive directly in the owned archive directory. Third-party resolution equality, versions/SRI, physical/hash checks and the original lock graph remain unchanged. Fresh preparation and all controls then passed.

## Public baseline preservation and limits

Before and after all mutations, root independently requalified the retained public npm 0.8.3 bundles and original signed NuGet archive from producer `df1340f713d3b65165a494eb09e53246298df858`. The retained NuGet archive SHA-256 remained `288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57`; its actual loaded DLL remained `37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2`. The original public smoke still passed. No retained pointer, package or legacy copied source was replaced.

Private receipts are `task7-minimal-artifact-gate.json`, `task7-minimal-npm-proof.json`, the prepare/check logs, and `hashbrown-candidate-isolation-JRBih8/isolation-evidence.json` under root-owned temporary evidence. They identify this executed snapshot only. Source-level HTTP primitives and native witness tests, full browser manifests/results, final docs/API/ABI qualification, and publication are distinct evidence domains. Actual cold browser acceptance remains pending at this checkpoint.
