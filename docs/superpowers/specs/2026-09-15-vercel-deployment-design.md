# Vercel Deployment Design

## Summary

Hashbrown moves its website deployment from Cloudflare Pages to Vercel and
replaces the bespoke Node deployer under `tools/cloudflare/` with a
workflow-native pipeline. GitHub Actions remains the only deployer: pull
requests receive Vercel preview deployments for affected targets, pushes to
`main` publish production, and every deployment is surfaced through the GitHub
Deployments API rather than a bot comment.

Only the documentation site (`www`) is a deployment target in this design. The
pipeline is shaped so that a second target is a one-entry addition; the
invoicing example is the intended next target once its server is made
stateless (see [Follow-on: invoicing](#follow-on-invoicing)).

## Goals

- `main` is the source of truth for production; production deploys
  automatically after validation.
- Pull requests from this repository get previews only for affected targets;
  a preview failure blocks merge.
- Deployments are visible natively in GitHub (PR sidebar, merge box,
  Environments) with no comment-marker machinery.
- The `/_/chat` server-sent-events route streams token-by-token on Vercel.
- Provisioning (project, env vars, domains, secrets, Cloudflare teardown) is
  scripted against the Vercel and GitHub APIs and re-runnable.
- No Cloudflare or Wrangler configuration remains in the repository.

## Non-Goals

- Deploying the invoicing example. Its server keeps authoritative state in
  process memory and builds a B4 workspace at process start, neither of which
  survives Vercel's stateless, scale-to-zero execution model.
- Deploying the finance, fast-food, and smart-home samples. They are being
  removed; this design deletes only their Cloudflare-specific files.
- Post-deploy smoke tests. Vercel's ready state is trusted.
- Migrating DNS records from a previous DNS host automatically. Records to
  recreate in Vercel DNS are supplied to the bootstrap script as a file.
- Switching registrar nameservers. Squarespace has no API; this is the one
  manual step.

## Targets

Targets are declared once, in the deploy workflow, as a matrix `include`
list:

| key   | Nx project | dir          | Vercel project  | project-ID secret        |
| ----- | ---------- | ------------ | --------------- | ------------------------ |
| `www` | `www`      | `www/analog` | `hashbrown-www` | `VERCEL_PROJECT_ID_WWW`  |

- `key` is the Nx project name and the suffix of the project-ID secret.
- `dir` is the directory that contains `.vercel/output` after `nx build` and
  is passed to `vercel --cwd`.
- Shared secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`.

The Vercel project is never connected to the GitHub repository. The CLI is
the only path that creates deployments, so there is nothing to disable and no
duplicate builds.

The Vercel plan is Hobby (personal scope). Consequences: preview deployments
are public, the function duration ceiling is 300 seconds, functions run in a
single region, and `--scope` is unnecessary.

## Build Output

`www` builds through Analog and Nitro. The Nitro preset changes from
`cloudflare-pages` to `vercel`, which emits a Build Output API v3 tree:

```
www/analog/.vercel/output/
  config.json                 # routes, overrides
  static/                     # client assets and prerendered pages
  functions/__nitro.func/     # one Node.js function for SSR and API routes
    .vc-config.json
```

`nx build www --configuration=production` is the whole build. There is no
`vercel build` step, and no `vercel.json`: with `--prebuilt`, Vercel reads
function configuration from `.vercel/output` only. Function settings live in
the Nitro plugin options in `www/analog/vite.config.ts`:

```ts
nitro({
  preset: 'vercel',
  vercel: { functions: { maxDuration: 300 } },
  // renderer, alias unchanged
})
```

`maxDuration: 300` is both Hobby's default and its maximum. It is set
explicitly because streamed response time counts against it and a future
plan change must not silently alter it.

Tooling that referenced the Cloudflare output path (`clean-output`,
`normalizeNitroPublicAssetPaths`, the `deployment-artifact` e2e test) follows
the new output directory. `.vercel/` is added to `.gitignore`.

## Streaming on Vercel

The `/_/chat` route in `www/analog/src/server/routes/_/chat.post.ts` streams
AG-UI events as `text/event-stream`. Research conclusions:

- **Node.js runtime on Fluid compute, not Edge.** Vercel's guidance for LLM
  streaming is the Node runtime. Edge functions must begin responding within
  25 seconds and lack Node APIs. Fluid compute is enabled by default for new
  projects.
- **Streaming is enabled by default for Node.js functions.** Nitro's `vercel`
  preset writes `supportsResponseStreaming: true` into `.vc-config.json`.
  Implementation verifies this in the generated file.
- **The existing handler shape is correct.** It returns a `ReadableStream`
  immediately and pulls upstream chunks inside `pull()`. The documented ways
  streaming breaks on Vercel are: awaiting the full upstream before returning
  a response, compression middleware buffering small chunks, and cache headers
  that permit intermediaries to buffer. Nitro adds no compression layer.
- **Header changes.** `Cache-Control` becomes
  `no-cache, no-store, must-revalidate, no-transform`, and
  `X-Accel-Buffering: no` is added. Both are inert on Vercel and protective
  behind any future proxy.
- **Environment access** uses `process.env` only; the
  `event.context._platform.cloudflare.env` branch is removed.
- **Abort** stays wired to `event.req.signal` so a disconnected client cancels
  the upstream OpenAI request.
- The 4.5 MB body limit applies to buffered bodies, not streamed ones. No
  heartbeat is needed because tokens arrive continuously; a chat turn
  completes well inside 300 seconds.

## Workflow

### `pr-main.yml`

Retains the existing `ci` job (lint, test, typecheck, build, e2e) minus the
"Test Cloudflare deployment tooling" step, and adds:

**`targets`** — runs for pull requests whose head repository is this
repository and whose author is not Dependabot. It computes the preview
matrix:

1. `npx nx show projects --affected --base <base sha> --head <head sha> --withTarget=build --type=app --json`
2. Intersect with the declared target keys.
3. If `.github/workflows/pr-main.yml` or `.github/workflows/deploy.yml`
   changed (`git diff --name-only base...head`), select all targets. Nx
   already treats `nx.json`, `package.json`, and the lockfile as global.
4. Output `matrix` as JSON. An empty selection skips the preview job.

**`preview`** — `needs: [ci, targets]`; calls `deploy.yml` with
`environment: preview`, the computed matrix, and the pull request head SHA.
Skipped when the matrix is empty.

**`production`** — runs on push to `main` and on `workflow_dispatch` from
`main`; `needs: ci`; calls `deploy.yml` with `environment: production` and
all targets. Concurrency group `deploy-production` with
`cancel-in-progress: false`: runs serialize, and GitHub retains only the
newest pending run, so a superseded commit cannot deploy after a newer one.
No SHA re-check is needed.

**`pr-gate`** — the single required status check for pull requests. Passes
when `ci` succeeded and `preview` succeeded or was skipped.

Permissions: `contents: read` at the workflow level; `deployments: write`
only on the jobs that call `deploy.yml`. Forks receive CI only.

### `deploy.yml` (reusable, `workflow_call`)

Inputs: `environment` (`preview` | `production`), `targets` (matrix JSON),
`ref` (commit SHA). Secrets are inherited. One job per matrix entry:

1. Checkout `ref`; set up Node from `.nvmrc`; `npm ci`.
2. `npx nx build <key> --configuration=production`.
3. Create a GitHub Deployment via `gh api repos/{repo}/deployments`:
   `ref`, `environment`, `auto_merge: false`, `required_contexts: []`,
   `transient_environment: true` and `production_environment: false` for
   previews; `production_environment: true` for production.
4. Deploy:

   ```
   vercel deploy --prebuilt --yes --cwd <dir> [--prod] \
     --token "$VERCEL_TOKEN" \
     -m githubDeployment=1 -m githubCommitRef=<branch> \
     -m githubCommitSha=<sha> -m githubCommitRepo=<repo> -m githubOrg=<owner>
   ```

   `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are provided as environment
   variables; no `vercel pull` or `.vercel/project.json` is required. By
   contract, `vercel deploy` prints only the deployment URL to stdout, which
   is captured directly. The `--meta` keys make Vercel treat the deployment
   as a branch deployment, so `hashbrown-www-git-<branch>-<scope>.vercel.app`
   also resolves.
5. Set `deployment_status` to `success` with `environment_url` set to the
   deployment URL. Any earlier failure sets `failure` instead. Previews use
   `auto_inactive: false` so one pull request's deployment does not
   inactivate another's in the shared `preview` environment.

Production deployments (`--prod`) receive the project's production domains
automatically on success.

## Local Deployment

`npx nx deploy www` builds for production and runs
`vercel deploy --prebuilt --cwd www/analog`; pass `--prod` to promote. It
requires a one-time `vercel login` and `vercel link` inside `www/analog`
(`.vercel/` is ignored by git). `vercel` becomes a pinned root
devDependency; `wrangler` is removed.

## Provisioning: `tools/vercel/bootstrap.mjs`

A dependency-free Node script, run once locally with a Vercel personal access
token, that provisions everything the pipeline assumes. Every step is
idempotent so the script can be re-run after a partial failure or reused for
a future target.

Inputs (environment variables): `VERCEL_TOKEN` (required),
`OPENAI_API_KEY` (required; never echoed), optional `OPENAI_MODEL` and
`OPENAI_BASE_URL`, optional `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` for teardown, optional `--dns-records <file>`
pointing at a JSON array of `{ name, type, value, ttl?, mxPriority? }`.

Steps, against the Vercel REST API and the `gh` CLI:

1. **Project** — `GET /v9/projects/hashbrown-www`; if absent,
   `POST /v11/projects` with `framework: null`, no `gitRepository`, and
   `nodeVersion: "24.x"`. Fluid compute remains at its default (enabled).
2. **Environment variables** — upsert `OPENAI_API_KEY` (and model/base URL
   overrides when provided) for `production` and `preview` via
   `POST /v10/projects/{id}/env?upsert=true` with type `encrypted`.
3. **Domains** — add `hashbrown.dev` and `www.hashbrown.dev` via
   `POST /v10/projects/{id}/domains`; `www` redirects to the apex
   (`redirect: "hashbrown.dev"`, `redirectStatusCode: 308`).
4. **DNS records** — when `--dns-records` is given, create each record via
   `POST /v2/domains/hashbrown.dev/records`, skipping records that already
   exist with identical values. Apex and `www` routing records are managed by
   Vercel and are not in this file.
5. **GitHub secrets** — `gh secret set VERCEL_TOKEN`, `VERCEL_ORG_ID` (the
   token owner's user ID from `GET /v2/user`), and `VERCEL_PROJECT_ID_WWW`.
6. **First production deployment** — `gh workflow run pr-main.yml --ref main`
   and print the run URL. A project's first deployment is production
   regardless of flags; subsequent runs use `--prod` explicitly.
7. **Cloudflare teardown** (only when Cloudflare credentials are present) —
   `DELETE /accounts/{account}/pages/projects/{name}` for `hashbrown-www`,
   `hashbrown-finance`, `hashbrown-fast-food`, `hashbrown-smart-home`,
   ignoring 404s, then `gh secret delete CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
8. **Nameservers** — print `ns1.vercel-dns.com` / `ns2.vercel-dns.com` and
   the domain verification state. Updating nameservers at Squarespace is the
   only manual step; run the script again afterwards to confirm the domain
   reports `verified: true`.

The script prints each step's outcome (`created`, `exists`, `updated`,
`skipped`) and exits non-zero on the first API error.

## Removed

- `tools/cloudflare/**` and the `cloudflare-deployment` Nx project.
- `www/analog/wrangler.toml`; `www/analog/DEPLOY.md` is rewritten for
  Vercel.
- In `samples/finance`, `samples/fast-food`, `samples/smart-home`: the
  `cloudflare/` Nx projects, `angular/functions/` Pages Functions,
  `angular/wrangler.toml`, and the `deploy` targets.
- `.wrangler` from `.gitignore`; the `wrangler` devDependency.
- Cloudflare target listings in `AGENTS.md`.

Historical specs and plans under `docs/superpowers/` remain as history. The
library's marketing copy about supporting Cloudflare Workers as a runtime is
about Hashbrown itself, not deployment, and is unchanged. No Netlify
configuration exists in the repository.

## Verification

- The generated `www/analog/.vercel/output` contains `config.json`, a
  `static/` tree with the client build, and
  `functions/__nitro.func/.vc-config.json` with
  `supportsResponseStreaming: true` and `maxDuration: 300`.
- `npx nx e2e www` passes against the new output directory.
- `npx nx test www`, `lint`, and `typecheck` pass.
- The first pull request shows a `preview` deployment in the PR sidebar with
  a working URL, and `curl -N` against `<preview>/_/chat` receives SSE events
  incrementally rather than as a single final chunk.
- After bootstrap, `https://hashbrown.dev/docs/angular/start/quick` serves
  the Angular quick start and `/_/chat` streams.

## Follow-on: Invoicing

To become a Vercel target, `samples/invoicing/server` needs:

- Session, review-capability, and thread-ownership state moved from in-process
  `Map`s to an external store (Vercel Marketplace Redis or equivalent),
  preserving the single-writer semantics the coordinator relies on.
- The B4 workspace (`mkdtemp` + source copy + `@b4run/*` symlinks) created
  at function cold start from bundled files, or replaced with a B4 runtime
  entry that does not require a workspace on disk.
- A build that produces `.vercel/output` (static React app plus a function
  for `/api/*` and `/agui/*`) and fits the 250 MB uncompressed function
  limit with LangChain and B4 included.

Once those hold, adding it is one matrix entry, one Vercel project created
by the bootstrap script, and one `VERCEL_PROJECT_ID_INVOICING` secret.
