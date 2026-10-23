# Hashbrown Release Runbook

This runbook describes the release process for the fixed Hashbrown npm release
group.

## Release Package Set

Hashbrown publishes these packages together at one version:

- `@hashbrownai/angular`
- `@hashbrownai/anthropic`
- `@hashbrownai/azure`
- `@hashbrownai/bedrock`
- `@hashbrownai/core`
- `@hashbrownai/google`
- `@hashbrownai/ollama`
- `@hashbrownai/openai`
- `@hashbrownai/react`
- `@hashbrownai/typesafe`

Each package must have an npm trusted publisher entry with:

- Publisher: GitHub Actions
- Organization/user: `liveloveapp`
- Repository: `hashbrown`
- Workflow filename: `npm-publish.yml`
- Allowed action: `npm publish`
- Environment: blank

## First Publication Of A New Package

A package must exist on npm before its trusted publisher can be configured
([npm prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/)).
`@hashbrownai/typesafe` is new in 0.8 and requires this bootstrap step.

Before triggering `npm/latest`, the maintainer must approve and complete the
first publication from the reviewed release artifact using an authorized npm
account, then configure the trusted publisher listed above. Do not add a
long-lived publishing token to the workflow as a workaround. Confirm the package
version, public access, and trusted publisher configuration before continuing.
If the release version was published during bootstrap, the normal publish run
must skip that existing version and still verify all ten packages.

Do not perform the bootstrap, create release tags, publish packages, or deploy
the release announcement until the maintainer explicitly gives the go-ahead.
Merging the release post into `main` deploys the site independently of npm.

### Prepare TypeSafe Without Publishing

Use npm 11.15.0 or later for `npm trust`. The maintainer account must have
two-factor authentication enabled and permission to publish under `@hashbrownai`.
`npm whoami --registry=https://registry.npmjs.org/` checks authentication without
publishing; if it fails, the maintainer can use `npm login` interactively. Never
put an authentication token or one-time password into this repository.

From a clean checkout of the reviewed release commit, build and pack locally:

```sh
npx nx build typesafe
mkdir -p dist/release/typesafe
npm pack ./dist/packages/typesafe --ignore-scripts --json \
  --pack-destination dist/release/typesafe > dist/release/typesafe/pack.json
shasum -a 256 dist/release/typesafe/hashbrownai-typesafe-0.8.0.tgz
npm publish dist/release/typesafe/hashbrownai-typesafe-0.8.0.tgz \
  --dry-run --ignore-scripts --access=public --registry=https://registry.npmjs.org/
```

These commands create and inspect a local artifact; they do not create the npm
package, configure trust, or publish it. Inspect the tarball manifest for
`@hashbrownai/typesafe@0.8.0`, public access, the `liveloveapp/hashbrown`
repository, and the `@hashbrownai/core@0.8.0` peer dependency. Confirm its README,
license, declarations, compiled entry point, and install files are present.
Record the reviewed commit and tarball checksum together. Rebuild and review
the artifact if the release commit changes.

### After Explicit Release Approval Only

The `npm publish` command below **publishes TypeSafe 0.8.0 publicly**. Do not run
it while publication is on hold. An unpublished core peer is expected until the remaining
release packages are published; do not promote the release until all ten verify.

From the same checkout and with the reviewed checksum confirmed:

```sh
npm whoami --registry=https://registry.npmjs.org/
npm publish dist/release/typesafe/hashbrownai-typesafe-0.8.0.tgz \
  --ignore-scripts --access=public --tag=latest --registry=https://registry.npmjs.org/
npm trust github @hashbrownai/typesafe \
  --repository=liveloveapp/hashbrown --file=npm-publish.yml --allow-publish \
  --registry=https://registry.npmjs.org/
npm trust list @hashbrownai/typesafe --json --registry=https://registry.npmjs.org/
npm access get status @hashbrownai/typesafe --registry=https://registry.npmjs.org/
npm view @hashbrownai/typesafe@0.8.0 version dist.integrity dist-tags --json \
  --registry=https://registry.npmjs.org/
```

Omit `--environment`: the publishing job has no GitHub environment. Inspect the
listed trust for the exact repository, workflow, and publish permission above.
Complete any npm authentication or 2FA prompts interactively. Compare npm's
`dist.integrity` with `pack.json` before triggering the remaining release.
Nx skips an existing version already carrying the requested tag, so the normal
`npm/latest` run can publish the other nine packages and verify the full set.
Do not execute `npm trust` with `--dry-run` as a setup probe: npm documents that
dry-run is not honored by some network configuration commands. Use the local
help output to check flags until trust can actually be configured.

## Prepare The Release Commit

1. Start from current `main`.
2. Generate the release version explicitly. Do not rely on semver keywords when
   old beta tags are not ancestors of `main`.
3. Generate the changelog for the intended range. If `CHANGELOG.md` already
   has a curated `## X.Y.Z (Unreleased)` entry, check it against the range and
   after maintainer approval replace `Unreleased` with the release date (`YYYY-MM-DD`).
4. Run local verification:

```sh
node --test scripts/verify-release-versions.spec.mjs scripts/verify-npm-release.spec.mjs
node scripts/verify-release-versions.mjs --tag vX.Y.Z
actionlint .github/workflows/*.yml
npx nx run-many -t test,lint -p vercel-bootstrap
npx nx run-many -t build -p angular anthropic azure bedrock core google ollama openai react typesafe --parallel=3
npx nx run-many -t test -p angular anthropic azure bedrock core google ollama openai react typesafe --parallel=3
npx nx run-many -t lint -p angular anthropic azure bedrock core google ollama openai react typesafe --parallel=3
npm_config_ignore_scripts=true npm_config_dry_run=true npx nx release publish --dry-run --parallel=1
```

5. Open the release PR for review. Keep a curated changelog entry marked
   `Unreleased` while publication is on hold. After the maintainer approves the
   release, set its date, update the release-post filename/slug and announcement
   timestamps together if needed, and merge through the protected `main` branch.
   Coordinate the post merge with npm availability so it does not announce
   packages before they can be installed.

## Tag And Publish

After the release commit is on `origin/main`:

```sh
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git tag -a --no-sign vX.Y.Z -m "Hashbrown X.Y.Z" HEAD
git push origin vX.Y.Z
```

Create the explicit GitHub release on the version tag:

```sh
awk '/^## X\\.Y\\.Z /{flag=1; next} /^## /{if (flag) exit} flag {print}' CHANGELOG.md \
  | gh release create vX.Y.Z --title "Hashbrown X.Y.Z" --notes-file -
```

Move the npm channel tag to the release commit and push it:

```sh
git tag -f --no-sign npm/latest HEAD
git push --force-with-lease origin npm/latest
```

`npm/latest` is a movable trigger tag. It is not the public release tag.

## Verify The Release

The `NPM Publish` workflow should:

1. Build release packages.
2. Publish serially with npm trusted publishing.
3. Verify every package exists on npm with the expected dist tag.

Website deployment to Vercel is independent of npm tags and package
publishing. Every run on `main` (push or manual dispatch) shares one workflow
concurrency group, so production deployments are strictly ordered: an
in-progress run finishes and deploys its commit, GitHub keeps only the newest
pending run, and that run then deploys the latest commit. A superseded commit
can therefore be live briefly, but never after a newer one. A release tag does
not trigger or repeat that deployment.

After the workflow succeeds, verify the GitHub release remains attached to the
version tag:

```sh
gh release list --limit 5 --json tagName,name,isLatest,isDraft,isPrerelease,publishedAt
```

If a failed or manual run creates an unwanted `npm/latest` GitHub release, delete
that release only. Keep the `npm/latest` tag because it records the publish
trigger.
