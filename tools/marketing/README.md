# Marketing service

`tools/marketing` is Hashbrown's marketing automation service: a b4run 0.14
app whose `dispatch` workflow runs one tick of the post queue (lease the
approved posts that are due, publish them, record the outcome). It is
deployed prebuilt to the Vercel project `hashbrown-marketing` and is only
ever called by the cron with the shared service bearer. Nothing publishes
unless its own `marketing_posts` row is `approved`.

The shell is structurally the same as `tools/lifecycle`; read its README for
the build output, the adapter and the two-database layout. Only the names
differ: the bearer is `MARKETING_SERVICE_SECRET`, the function is
`marketing.mjs`, and b4run state lives in `B4_DATABASE_URL` while the queue
tables (`marketing_weeks`, `marketing_posts`, `marketing_channel_credentials`)
live in the growth database (`DATABASE_URL`).

## Commands

```sh
npx nx build marketing            # type-check, b4 build --clean, wrap + verify the adapter
npx nx test marketing
npx nx lint marketing
npx nx check marketing            # b4 check plus type-checks
npx nx week marketing -- <args>   # weekly import/approval CLI (scripts/week.mts)
GROWTH_INTEGRATION=1 npx nx test-integration marketing   # needs TEST_DATABASE_URL
```

CI deploys it through the generic path in `.github/workflows/deploy.yml`.
The target is optional and is skipped while `VERCEL_PROJECT_ID_MARKETING` is
unset. The Vercel bootstrap (`tools/vercel/bootstrap.mjs`) creates the
project; the Neon integration injects `DATABASE_URL` and `B4_DATABASE_URL`.

## Status

The dispatch workflow currently returns an empty result. The queue
repository, channel adapters and publishing logic land in later tasks.
