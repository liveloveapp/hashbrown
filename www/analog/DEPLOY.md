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
- Same-repository branches are the trusted preview boundary because preview deployment requires Cloudflare credentials. Pull requests from forks do not receive credentials or Pages previews.
- A validated `main` SHA deploys only if it is still the current `main` SHA immediately before production. When it deploys, the workflow publishes all four production Pages projects: the documentation site, finance sample, fast-food sample, and smart-home sample. Any run superseded by a later push skips production deployment, regardless of whether that later push subsequently passes validation.
- Each Cloudflare Pages project's production branch must be `main`.
- npm package publishing is independent of Cloudflare deployment. Publishing or moving an npm trigger tag does not deploy Pages.

## Manual Deployment

- Ensure Wrangler is authenticated (`npx wrangler login` or `npx wrangler login --scopes=d1:write` if needed).
- Run `npx nx deploy www` to build for production and deploy the documentation output to Cloudflare Pages through Wrangler.

## Local Preview

- Terminal 1: `npx nx run www:build:development --watch`
- Terminal 2: `npx wrangler pages dev dist/www/analog/analog/public`
