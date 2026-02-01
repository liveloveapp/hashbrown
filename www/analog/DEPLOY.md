# Deploying `www` to Cloudflare Pages

Cloudflare Pages now hosts the `www` site. The Pages configuration is stored in `wrangler.toml` and deploys the Nitro-generated `_worker.js` for SSR.

## Build
- Command: `npx nx run www:build:production`
- Output directory: `dist/www/analog/analog/public` (contains `_worker.js` and static assets)

## Environment
- Set `OPENAI_API_KEY` in the Pages project environment variables. The `/_/chat` Nitro route reads it from the Pages environment.

## Deploy from the Dashboard
1) Create/point a Pages project at this repository.  
2) Build command: `npx nx run www:build:production`  
3) Output directory: `dist/www/analog/analog/public`  
4) Add `OPENAI_API_KEY` (and any future provider keys) under *Settings → Environment Variables*.  
5) Deploy – Pages will bundle the `_worker.js` automatically using `wrangler.toml`.

## Deploy from the CLI
- Ensure `wrangler` is authenticated (`npx wrangler login` or `npx wrangler login --scopes=d1:write` if needed).
- Run `npx nx run www:deploy` to build (production) and deploy to Cloudflare Pages using `wrangler.toml`.

## Local Preview
- Terminal 1: `npx nx run www:build:development --watch`
- Terminal 2: `npx wrangler pages dev dist/www/analog/analog/public`
