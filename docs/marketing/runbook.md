# Marketing automation runbook

How to stand up, run and pause hashbrown's marketing automation (phase 1). Design: `docs/superpowers/specs/2026-10-29-marketing-automation-design.md`. The weekly review itself is the `/hashbrown-week` Claude Code skill (`.claude/skills/hashbrown-week/SKILL.md`).

## What runs where

- `hashbrown-marketing` (Vercel project, `tools/marketing`): the b4run app whose `dispatch` workflow publishes due, approved posts. Only the cron calls it, with the `MARKETING_SERVICE_SECRET` bearer.
- `hashbrown-www`: the `/_/cron/marketing` route, every 15 minutes (`www/vercel.json`). It answers 503 and dispatches nothing unless `MARKETING_CRON_ENABLED` is exactly `true`.
- The growth Neon database (`DATABASE_URL`): `marketing_weeks`, `marketing_posts` and `marketing_channel_credentials` (X and LinkedIn tokens, encrypted with `MARKETING_CREDENTIALS_KEY`).
- Brian's laptop: the week CLI (`npx nx run marketing:week -- <command>`) and the auth CLIs. Both talk to the growth database directly.

Nothing publishes unless its own `marketing_posts` row is `approved`.

## Secrets (names only)

Never commit, print or paste any of these into logs, PRs or chat.

| Where                  | Names                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hashbrown-marketing`  | `DATABASE_URL` and `B4_DATABASE_URL` (Neon integration, never set by hand or by the bootstrap), `MARKETING_SERVICE_SECRET`, `MARKETING_CREDENTIALS_KEY`, `MARKETING_GITHUB_TOKEN`, `MARKETING_DRY_RUN`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_AUTHOR_URN`, `DEVTO_API_KEY` |
| `hashbrown-www`        | `CRON_SECRET` (existing), `MARKETING_CRON_ENABLED`, `MARKETING_SERVICE_SECRET` (same value as on marketing), `MARKETING_URL` (production) and `PREVIEW_MARKETING_URL` in the bootstrap env file (preview)                                                                                                                        |
| GitHub Actions         | `VERCEL_PROJECT_ID_MARKETING` (the bootstrap sets it; deploys skip marketing while it is unset)                                                                                                                                                                                                                                  |
| Brian's local env file | `DATABASE_URL` (production growth), `MARKETING_CREDENTIALS_KEY`, and for the auth CLIs `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`                                                                                                                                                          |

`MARKETING_GITHUB_TOKEN` is a fine-grained token scoped to `liveloveapp/hashbrown` only, with read and write on contents and pull requests. It must not be an admin token; it never bypasses the "Protect Main" ruleset.

`ANTHROPIC_API_KEY` is not needed until phase 2 (cloud drafting).

## 1. Provision the Vercel project

1. Generate the two random secrets (keep them in your private bootstrap env file):

   ```sh
   openssl rand -base64 32   # MARKETING_CREDENTIALS_KEY
   openssl rand -base64 32   # MARKETING_SERVICE_SECRET
   ```

   `MARKETING_CREDENTIALS_KEY` encrypts the stored tokens. Changing it later makes every stored token unreadable, so the auth CLIs must be re-run.

2. Put the `hashbrown-marketing` names above in the bootstrap env file, with `MARKETING_DRY_RUN=1` for now (see step 5). Then create the project and upsert its env:

   ```sh
   node tools/vercel/bootstrap.mjs --env-file <private env file> --only marketing --skip-workflow
   ```

   This creates `hashbrown-marketing`, sets the GitHub secret `VERCEL_PROJECT_ID_MARKETING`, and reports `MARKETING_SERVICE_SECRET` as `missing` if it is not set.

3. Connect the Neon stores through the Vercel Marketplace integration the same way `hashbrown-lifecycle` is connected (`docs/superpowers/runbooks/2026-10-20-growth-provisioning.md`, step 5): the growth production and preview stores with no prefix (so `DATABASE_URL` appears), and a b4 state store with the prefix `B4_` (so `B4_DATABASE_URL` appears).

4. Deploy marketing (merge to `main`, or run `.github/workflows/deploy.yml`), note its production and preview URLs, then set the www side. Add `MARKETING_URL`, `PREVIEW_MARKETING_URL`, `MARKETING_SERVICE_SECRET` and `MARKETING_CRON_ENABLED=false` to the env file and run:

   ```sh
   node tools/vercel/bootstrap.mjs --env-file <private env file> --only www --skip-workflow
   ```

Vercel env changes apply to new deployments only. Redeploy the project after every env change below.

## 2. Run the migrations

The queue tables come from `tools/growth/migrations/0012_marketing_queue.sql`. Apply pending migrations to the production growth store (preview gets only migrations already on `main`):

```sh
env -u TEST_DATABASE_URL -u B4_DATABASE_URL DATABASE_URL=<production growth URL> npx nx run growth:migrate-growth
```

It is idempotent. Nx loads the repo-root `.env` into every target, so check that file has no `DATABASE_URL` or `TEST_DATABASE_URL` first.

## 3. Local environment

Keep the local values in `~/.config/hashbrown/marketing.env` (outside the repo, `chmod 600`), as `NAME='value'` lines: `DATABASE_URL` (the production growth URL, the same store the cron reads), `MARKETING_CREDENTIALS_KEY`, and the four X and LinkedIn client names. The `/hashbrown-week` skill sources this file for every CLI call. The week CLI refuses to run when `TEST_DATABASE_URL` or `B4_DATABASE_URL` is set.

## 4. Authorize the channels

Run each from the repo root with the local env file sourced:

```sh
(set -a; . ~/.config/hashbrown/marketing.env; set +a; npx nx run marketing:x-auth)
(set -a; . ~/.config/hashbrown/marketing.env; set +a; npx nx run marketing:linkedin-auth)
```

Each opens a browser and stores the tokens encrypted in `marketing_channel_credentials`. The developer apps need these redirect URLs: X `http://localhost:8723/callback`, LinkedIn `http://localhost:8724/callback`.

- X refresh tokens rotate; the service persists each new one, so X needs re-authorizing only if a refresh fails.
- LinkedIn tokens last 60 days and cannot be refreshed. **Re-run `linkedin-auth` every 60 days.** `week status` lists it when it expires within 14 days, and dispatch raises a `credential_expiring` alert.
- `linkedin-auth` prints the `LINKEDIN_AUTHOR_URN`. Set it on `hashbrown-marketing` if it is not already, then redeploy.
- dev.to: create an API key in dev.to Settings, Extensions, and set `DEVTO_API_KEY`. Leave dev.to's RSS import off; the API is the only path to dev.to.

## 5. First week in dry run, then live

1. With `MARKETING_DRY_RUN=1` on `hashbrown-marketing` (redeployed), set `MARKETING_CRON_ENABLED=true` on `hashbrown-www` and redeploy www. The cron now runs dispatch every 15 minutes in dry run.
2. Run `/hashbrown-week` and approve a week as usual. Through that week, `npx nx run marketing:week -- status` and `week show` should show each approved post `published` at its time. X, LinkedIn and dev.to rows get a `dry-run://` URL; the blog row shows its real `https://hashbrown.dev/blog/<slug>` URL even though nothing was merged (its `externalId` is `dry-run`).
   - Dry run makes no GitHub calls: the blog post is marked `published` at its time without merging, and the PR stays open. Merge or close it by hand.
   - A dry-run week's posts are spent: they are `published` in the queue and cannot be re-imported. Post anything you still want by hand, or keep that week light.
   - Dry run still validates every draft, so a bad draft fails there just as it would live.
3. After a clean dry-run week, remove `MARKETING_DRY_RUN` from `hashbrown-marketing` (or set it to `0` or `false`) and redeploy. Only `1` and `true` mean dry run; unset, empty, `0` and `false` mean live, and any other value fails every tick with a configuration error naming `MARKETING_DRY_RUN`, which shows as `[marketing-cron-failed]`. Leave `MARKETING_CRON_ENABLED=true` on www. The next approved week publishes for real.

## Pause everything

Set `MARKETING_CRON_ENABLED=false` on `hashbrown-www` and redeploy. The route answers 503 and nothing dispatches; approved rows stay approved. When you turn it back on, approved posts that came due meanwhile publish on the next ticks (five per tick) if they are at most 6 hours late; X, LinkedIn and dev.to posts more than 6 hours late are held with "missed its slot by N hours" instead (`MAX_LATENESS_MS`). Hold any others that should not go out late before turning it back on.

## Hold or cancel a single post

Find the post id with `npx nx run marketing:week -- show --week <Monday>`, then:

```sh
npx nx run marketing:week -- hold --post <id>      # skipped until released
npx nx run marketing:week -- approve --post <id>   # release a hold, or retry a failed post
npx nx run marketing:week -- cancel --post <id>    # never publishes
```

(With the local env file sourced, as in step 4.) A post that is `publishing` or `published` cannot be held or cancelled. Posts that depend on a held blog post wait until it publishes.

## Failures and alerts

A post that fails three times goes to `failed`. A blog post that cannot merge at its time (PR Gate red, conflicts, PR closed) goes to `failed`, and one that is not live within 24 hours of merge goes to `held` with everything depending on it. An X, LinkedIn or dev.to post reached more than 6 hours after its slot goes to `held` ("missed its slot by N hours"). All of these show up at the top of the next `/hashbrown-week` (`week status`, `attention`) with `lastError`, as do posts published in the last 14 days that carry a warning. Fix the cause, then `approve --post <id>` to retry (move a post whose time has passed to a new slot first).

### Where alerts appear

The marketing service returns its alerts to the www cron route, which logs them in the `hashbrown-www` project's logs on Vercel (Logs, filter on the route `/_/cron/marketing` or the line prefix):

- `[marketing-operator-alert] <kind>`: one line per alert kind per tick.
- `[marketing-cron-failed]`: the tick itself failed (marketing unreachable, timed out, answered an error or an invalid state, or a configuration error such as a missing env var or a bad `MARKETING_DRY_RUN`). Nothing was dispatched, or the outcome of that tick is unknown; check the `hashbrown-marketing` logs for the cause.
- `[marketing-cron-misconfigured]`: `MARKETING_CRON_ENABLED` is neither `true` nor `false`.

Alert kinds and what to do:

| Kind                  | Meaning                                                                                                                                                                            | What to do                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_failed`         | A post went to `failed`: three failed attempts, a blog PR that cannot merge, or `publish outcome unknown` (a create timed out, lost its connection or got a 5xx, and may be live). | Run `week status` and read `lastError`. For "publish outcome unknown", look at the channel first: if the post is there, `cancel` the row; if not, move it to a future slot and `approve --post`. Otherwise fix the cause and `approve --post`. |
| `post_warning`        | A post published, but a follow-up step failed (today: the LinkedIn first comment). The reason is in that post's `lastError`.                                                       | Open the post's `externalUrl` and finish the step by hand (add the first comment). Nothing to retry; the row stays `published`.                                                                                                                |
| `blog_not_live`       | A merged blog post was not live within 24 hours; it and its dependents are `held`.                                                                                                 | Check the www deploy for the merge. Once the URL answers 200, release the blog and its dependents with `approve --post` (moving any whose slot has passed).                                                                                    |
| `credential_expiring` | A stored LinkedIn token expires within 14 days (X never raises it: its refresh token rotates and does not expire).                                                                 | Run `linkedin-auth` (step 4). The alert repeats every tick until you do.                                                                                                                                                                       |
