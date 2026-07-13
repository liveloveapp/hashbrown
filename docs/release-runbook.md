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
- `@hashbrownai/writer`

Each package must have an npm trusted publisher entry with:

- Publisher: GitHub Actions
- Organization/user: `liveloveapp`
- Repository: `hashbrown`
- Workflow filename: `npm-publish.yml`
- Allowed action: `npm publish`
- Environment: blank

## Prepare The Release Commit

1. Start from current `main`.
2. Generate the release version explicitly. Do not rely on semver keywords when
   old beta tags are not ancestors of `main`.
3. Generate the changelog for the intended range.
4. Run local verification:

```sh
node --test scripts/deploy-smoke.spec.mjs scripts/verify-release-versions.spec.mjs scripts/verify-npm-release.spec.mjs
node scripts/verify-release-versions.mjs --tag vX.Y.Z
actionlint .github/workflows/npm-publish.yml .github/workflows/cloudflare-production.yml
npx nx run-many -t build -p angular anthropic azure bedrock core google ollama openai react writer --parallel=3
npx nx run-many -t test -p angular anthropic azure bedrock core google ollama openai writer --parallel=3
npx nx run-many -t lint -p angular anthropic azure bedrock core google ollama openai --parallel=3
npx nx release publish --dry-run
```

5. Open and merge the release PR through the protected `main` branch.

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
4. Deploy production Cloudflare Pages.
5. Smoke test production URLs.

After the workflow succeeds, verify the GitHub release remains attached to the
version tag:

```sh
gh release list --limit 5 --json tagName,name,isLatest,isDraft,isPrerelease,publishedAt
```

If a failed or manual run creates an unwanted `npm/latest` GitHub release, delete
that release only. Keep the `npm/latest` tag because it records the publish
trigger.
