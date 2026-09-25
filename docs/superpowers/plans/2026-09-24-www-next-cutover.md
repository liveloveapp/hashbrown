# www-next Cutover Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve hashbrown.dev from the Next.js site (`www-next`), then retire the Analog site (`www/analog`) without a window where either the site or its build tooling is broken.

**Prerequisites:** #591 (archive uploads) and #592 (migration-guide redirects) merged; next.hashbrown.dev deployed and compared page by page with hashbrown.dev (desktop and mobile, search, chat, API pages, blog, redirects).

**Approach:** three PRs, each safe to deploy and each reversible.

1. **Switch traffic:** move the domains to the Next project. Nothing is deleted, so rollback means moving the domains back.
2. **Move ownership:** move content, generated inputs and docs tooling into `www/next`, so the Next site no longer reads from `www/analog`.
3. **Delete:** remove `www/analog`, its dependencies and its deploy target, then rename the Nx project `www-next` to `www`.

---

## PR 1: Point hashbrown.dev at the Next project

- `tools/vercel/bootstrap.mjs`:
  - Move `hashbrown.dev` and `www.hashbrown.dev` (308 to the apex) from the `www` target to `www-next`. Keep `next.hashbrown.dev`, or drop it; decide at review.
  - Move the certificate and DNS-zone steps that are keyed on `target.key === 'www'` to the target that owns `DOMAIN`, rather than to a key.
  - Update the tests: the target that has the apex domain owns the DNS step.
- Vercel refuses to attach a domain that's already on another project. The script has to remove each domain from the old project before adding it to the new one, and log that it did. Add an `ensureDomainMoved(vercel, fromProjectId, toProjectId, domain)` with tests for three cases: moved, already there, and missing from both.
- After merging, run `node tools/vercel/bootstrap.mjs --env-file <root .env> --skip-workflow`, then check:
  - `curl -sI https://hashbrown.dev/` serves Next, with no Nitro `x-powered-by` header.
  - `/docs/react/start/migration` returns 301.
  - `/_/chat` streams.
  - The certificate is valid.
- **Rollback:** revert the PR and re-run bootstrap. The Analog project keeps deploying from `main`, so it's current.

## PR 2: Move content and tooling into www/next

These move with `git mv` so history is kept:

| From `www/analog/…` | To `www/next/…` |
| --- | --- |
| `src/app/pages/docs/**` | `content/docs/**` |
| `src/content/blog/**` | `content/blog/**` |
| `public/**` | `public/**`, replacing the symlink |
| `src/tools/extract-docs-content.ts` (collect-docs), `generate-llms.mjs`, `review-docs.ts`, `translate-docs.ts`, `api-extractor.json` and helpers | `src/tools/**` |

Then:
- Generated reference JSON goes to `www/next/content/reference` (gitignored). Update `content.ts`, `api-reference.ts`, `search-index.ts` and `spike-report.ts` to read from `www/next`.
- Move the `collect-docs`, `generate-llms`, `review-docs` and `translate-docs` targets to `www/next/project.json`, and update `dependsOn` so nothing points at `www:*`. Update the root `package.json` scripts (`www-full`, `docs:translate`, `docs:review`).
- `www/analog` still has to build until PR 3. Point its content paths at `www/next/content` in its Vite config and tools, or accept that it stops building and remove its deploy target in this PR. Decide at review; removing the target here is simpler.
- Port `www/analog/e2e` (deployment-artifact and vite-config checks) to Next equivalents, for example the `.vercel/output` shape and the redirects in `config.json`.
- Update AGENTS.md: the docs-site commands and the "Definitions (from docs in www)" wording.

## PR 3: Delete the Analog site

- Delete `www/analog`, the `www` target in `DEPLOY_TARGETS` and bootstrap's `www` target. The Vercel project `hashbrown-www` stays; delete it by hand after a week.
- Remove root dependencies that nothing else uses: `@analogjs/*`, `nitro`, `h3`, `ngx-markdown`, `figma-squircle`, `marked-highlight`, and the Angular site-only packages (`@angular/material`, `@angular/cdk`, `@angular/elements`, `@angular/platform-server`, `@angular/platform-browser-dynamic`) **only if** `packages/angular`, examples and test hosts don't use them. Check with `npm ls` and grep before removing; ask before any removal that isn't clear-cut.
- Rename the Nx project `www-next` to `www`, and decide whether to move the directory to `www/`. Update the CI target keys, `VERCEL_PROJECT_ID_WWW_NEXT`, bootstrap and AGENTS.md.
- Remove the dev-server workarounds that only existed for Analog (`angular-linker-deps-plugin.ts`, `ssr-deps-ready-plugin.ts`; they go with the directory). Close the loop on analogjs/analog#2577 and #2578 as no longer blocking us.
- Update memory and `SPIKE.md`: the migration is complete.

## Decisions (2026-09-24)

1. `next.hashbrown.dev` is dropped. The site serves at `hashbrown.dev`, with `www.hashbrown.dev` redirecting to it (308) as before.
2. Analog stops deploying in PR 1 instead of being kept building. PRs 2 and 3 merge into one: move to `www/` and delete `www/analog`.
3. The Next app moves to `www/`, and the Nx project is renamed `www`.
4. The Vercel project `hashbrown-www` is deleted by hand in the dashboard after the switch is verified; deletion is permanent. The agent moves the domains and tidies the GitHub secrets.

## As executed

- **PR 1 (domains, stop Analog):**
  - `DEPLOY_TARGETS` drops `www` and makes `www-next` required.
  - Bootstrap's `www-next` target takes both domains through Vercel's move endpoint (`POST /v1/projects/{from}/domains/{name}/move`), so they're never detached in between. `previousProject: 'hashbrown-www'` tells it where they live, and `removedDomains` detaches `next.hashbrown.dev`.
  - The DNS and certificate steps key on whichever target owns the apex.
  - **Run order:** merge, then run `node tools/vercel/bootstrap.mjs --env-file <root .env> --skip-workflow`. hashbrown.dev switches to the Next project's current production deployment when the move completes, so that deployment must exist and be verified first.
  - **Rollback:** `node tools/vercel/move-domains.mjs --env-file <root .env> --from hashbrown-www-next --to hashbrown-www` moves both domains back through the same endpoint, and hashbrown.dev serves the Analog project's last production deployment. Reverting the PR alone isn't enough: a restored `www` target would try to create domains the Next project still holds. The rollback only works until `hashbrown-www` is deleted, so delete it only once the cutover has held.
- **PR 2 (move to `www/`, delete Analog):** see the tasks above. PR 2 and PR 3 are combined.
- **Renames (2026-09-25, #600):** the Vercel projects were renamed through the API. The live Next project (`prj_74Nr…`) is `hashbrown-www`, and the retired Analog project (`prj_7cN7…`) is `hashbrown-www-analog`. The rollback is now `move-domains.mjs --from hashbrown-www --to hashbrown-www-analog`. `hashbrown-www-analog` is deleted by hand in the dashboard once the cutover has held.
- **Analog project deleted (2026-09-25):** `hashbrown-www-analog` was deleted through the API after a rollback round-trip confirmed the move worked both ways. The rollback is gone, and bootstrap no longer has a `previousProject`.
