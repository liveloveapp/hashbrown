# Deploying `www` to Cloudflare Pages

Cloudflare Pages now hosts the `www` site. The Pages configuration is stored in `wrangler.toml` and deploys the Nitro-generated `_worker.js` for SSR.

## Build

- Command: `npx nx run www:build:production`
- Output directory: `dist/www/analog/analog/public` (contains `_worker.js` and static assets)

## Environment

- Set `OPENAI_API_KEY` in the Pages project environment variables. The `/_/chat` Nitro route reads it from the Pages environment.

## Automated Deployment

The `PR / Main CI` workflow validates changes before deploying Cloudflare Pages.

- For pull requests from branches in this repository, the workflow builds and deploys only affected Pages applications after validation succeeds. It updates one pull request comment with the preview URLs.
- Same-repository branches are the trusted preview boundary because preview deployment requires Cloudflare credentials. Pull requests from forks and Dependabot pull requests do not receive credentials or Pages previews.
- Immediately before production starts, the workflow checks whether the validated SHA is still the current `main` SHA. A run already superseded at that check skips production. A push after the check does not stop the active deployment; workflow concurrency allows a later run to deploy afterward if it passes validation and is still current at its check. Production publishes all four Pages projects: the documentation site, finance sample, fast-food sample, and smart-home sample.
- Each Cloudflare Pages project's production branch must be `main`.
- npm package publishing is independent of Cloudflare deployment. Publishing or moving an npm trigger tag does not deploy Pages.

## Manual Deployment

- Ensure Wrangler is authenticated (`npx wrangler login` or `npx wrangler login --scopes=d1:write` if needed).
- Run `npx nx deploy www` to build for production and deploy the documentation output to Cloudflare Pages through Wrangler.

## Local Preview

- Terminal 1: `npx nx run www:build:development --watch`
- Terminal 2: `npx wrangler pages dev dist/www/analog/analog/public`
