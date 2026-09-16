# Deploying `www` to Vercel

Vercel hosts the `www` site as one Node.js function (SSR and `/_/chat`) plus
static assets. Nitro's `vercel` preset in `vite.config.ts` writes a Build
Output API tree to `.vercel/output` at the repository root (Analog pins the
Nitro output to its `workspaceRoot`); nothing else configures the deployment.

## Build

- Command: `npx nx build www --configuration=production`
- Output: `<repo-root>/.vercel/output` (`config.json`, `static/`,
  `functions/__server.func/`)

## Environment

`OPENAI_API_KEY` is a Vercel project environment variable for Production and
Preview. `OPENAI_MODEL` and `OPENAI_BASE_URL` are optional overrides. The
`/_/chat` route reads them from `process.env`.

## Automated deployment

`.github/workflows/pr-main.yml` validates changes, then calls
`.github/workflows/deploy.yml`:

- Pull requests from branches in this repository get a preview deployment
  for each affected target. Each deployment is recorded as a GitHub
  Deployment in the `preview` environment, so the URL appears in the pull
  request sidebar. A preview failure fails the `PR Gate` check.
- Pushes to `main` deploy every target to production after validation
  succeeds. Every run on `main` (push or manual dispatch) shares one workflow
  concurrency group, so production deployments are strictly ordered.
- Forks and Dependabot pull requests receive CI only.

Targets are declared in the `DEPLOY_TARGETS` environment variable of
`pr-main.yml`. `dir` is the directory that contains `.vercel/output` and is
passed to `vercel --cwd`. Each target needs a `VERCEL_PROJECT_ID_<KEY>`
repository secret; `VERCEL_TOKEN` and `VERCEL_ORG_ID` are shared.

## Manual deployment

One-time: `npx vercel login`, then `npx vercel link` from the repository root
and pick the `hashbrown-www` project (`.vercel/` is ignored by git).

- Preview: `npx nx deploy www`
- Production: `npx nx deploy www -- --prod`

## Provisioning

`node tools/vercel/bootstrap.mjs --env-file <path>` creates the Vercel
project, environment variables, domains, and GitHub secrets, and can tear down
the former Cloudflare Pages projects (`--teardown-cloudflare`). It is safe to
re-run; pass `--skip-workflow` on re-runs so it does not dispatch another
production deployment. See the script header for options.

## Local preview

- Terminal 1: `npx nx run www:build:development --watch`
- Terminal 2: `npx nx serve www`
