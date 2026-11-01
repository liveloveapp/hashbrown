# Original preview1 compatibility fixtures

These are Hashbrown's own MIT-licensed original qualified release artifacts for
`Hashbrown.AspNetCore 0.1.0-preview.1`, produced at
`df1340f713d3b65165a494eb09e53246298df858`. They were independently retained
from the original release qualification, then checked against both its release
archive ledger and the immutable published-consumer metadata.

| Original artifact                             |  Bytes | SHA256                                                             |
| --------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `Hashbrown.AspNetCore.0.1.0-preview.1.nupkg`  | 236816 | `0d0116c35045ad64243e82cf8eecd89bb98d6532ff94042ddce6d51d3e1d1647` |
| `Hashbrown.AspNetCore.0.1.0-preview.1.snupkg` |  60682 | `d8b34b750f7edcc932d88540ea8b0ab8ae89a00cbc91d3093ba6658c4e4c140a` |

The unsigned package and symbols are immutable historical test inputs. Never
regenerate them, strip a signature to manufacture them, or republish the version.
They bundle only Hashbrown's own DLL/XML/PDB, MIT license, readme, and NuGet
metadata. `provenance.json` records the exact entry inventories.

Portable qualification downloads the official signed public archive separately,
requires SHA256 `288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57`,
and invokes the unchanged frozen producer's signature, payload-equality,
canonical-hash, dependency-closure and actual loaded-assembly guards. The expected
runtime DLL SHA256 is
`37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2`.
The original unsigned pair supplies independent release evidence; no deterministic
rebuild of historical absolute debug paths is claimed.

The fourth explicit `test-recovery-compatibility` profile requires separately
prepared public NuGet and npm 0.8.3 pointers. The mandatory acceptance upgrade
wrapper prepares them; ordinary source tests do not depend on private local paths.
