# Growth provisioning runbook

Provisions the growth layer's vendors (Neon through the Vercel Marketplace, PostHog, Resend, Vercel) and
writes the environment variables to the `hashbrown-www` and
`hashbrown-lifecycle` Vercel projects. Design: section 14 of
`docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md`.

## Tokens

Put these in the repo-root `.env` (gitignored), or in any private file you
point `--env-file` at:

```
POSTHOG_PERSONAL_API_KEY=
RESEND_PROVISION_API_KEY=
VERCEL_API_TOKEN=
FOUNDER_NOTIFICATION_EMAIL=brian@hashbrown.dev
```

Prerequisite: `gh auth login` with permission to set repository secrets on
`liveloveapp/hashbrown` (the bootstrap runs `gh secret set` for the
`VERCEL_PROJECT_ID_*` secrets).

- **Neon**: no key. The stores are created on the Vercel team through its
  existing Neon integration (installed from the Vercel Marketplace), using
  the Vercel token. Vercel injects the connection strings
  (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and the `POSTGRES_*`/`PG*`
  family) into the connected projects; nothing is written to `growth.env`.
  Pull them locally with `vercel env pull`.
- **PostHog**: a personal API key with the `organization:read` and
  `project:write` scopes.
- **Resend**: a full-access API key (it creates the domain and the
  sending-only key).
- **Vercel**: the CI deploy token for the team that owns the hashbrown
  projects (`VERCEL_API_TOKEN` in the root `.env`; `VERCEL_TOKEN` also works).
  It also creates and connects the Neon integration stores (storage
  access on the team). It is the token CI deploys with, so never revoke it. The run does not
  replace the `VERCEL_TOKEN` or `VERCEL_ORG_ID` GitHub secrets.

Tokens are read only from `--env-file` or the process environment. They are
never written to the output, the logs, or the checklist.

## Run

```
node tools/growth/scripts/provision/index.mjs --env-file .env
```

`--out <dir>` changes where the output goes (default
`tools/growth/.provision` in this repository, whatever the current
directory; gitignored). The script:

1. Provisions the PostHog project.
2. Provisions the Resend domain, its DNS records on Vercel, and a
   sending-only key.
3. Writes `<out>/growth.env` (mode 0600, atomically, and only when its
   contents change) with the generated secrets, the vendor values, and every
   rollout switch set to `false`.
4. Runs `tools/vercel/bootstrap.mjs --env-file <out>/growth.env
--skip-workflow --skip-token-secrets`, which upserts production values and `PREVIEW_`-prefixed
   preview values on both Vercel projects. The `OPENAI_*` keys are not in
   that file, so the www target reports them `missing`; that is expected.
5. After the bootstrap exits 0 (the lifecycle project must exist), creates
   five Neon stores through the Vercel Marketplace integration and connects
   them: `growth-production-target-01` and `growth-preview-target-01` to
   `hashbrown-www` and `hashbrown-lifecycle` (production and preview, no
   prefix), and `b4-production-target-01` and `b4-preview-target-01` to
   `hashbrown-lifecycle` with the prefix `B4_`, so `B4_DATABASE_URL` appears
   on lifecycle. The fifth store, `growth-test-target-01`, serves only the
   integration specs: it is connected to `hashbrown-lifecycle` for the
   `development` environment with the prefix `TEST_`, so `TEST_DATABASE_URL`
   appears there. The bootstrap never upserts the database variables.
6. Reads that `TEST_DATABASE_URL` back from Vercel (decrypted) and writes
   `<out>/test-database.env` (mode 0600, atomically, only when it changes) as
   `TEST_DATABASE_URL='...'`. When the value is not readable the checklist
   gets a manual line and no file is written. The value is never printed.
7. Prints the checklist.

## Manual steps

The checklist ends with these:

1. **Resend webhook secret**: create a webhook at
   https://resend.com/webhooks for `https://hashbrown.dev/_/webhooks/resend`
   with the events listed in the checklist line, then set
   `RESEND_WEBHOOK_SECRET` on `hashbrown-www` and `hashbrown-lifecycle`.
2. **Mailbox**: create the `brian@hashbrown.dev` Google Workspace mailbox.
3. **Preview values**: once the preview lifecycle URL exists, set
   `GROWTH_PUBLIC_ACTION_ORIGIN`, `LIFECYCLE_URL`,
   `RESEND_NON_PRODUCTION_ALLOWLIST`, and `RESEND_NON_PRODUCTION_REDIRECT_TO`
   on Vercel's Preview target under those plain names. The `PREVIEW_` names
   in the checklist refer to `growth.env` keys. A rerun regenerates
   `growth.env`, so lines you added by hand are dropped unless you add them
   again.

If Resend's sending key already existed and no earlier `growth.env` holds it,
the checklist also lists a manual step to create a new key, because Resend
shows a key only once.

## Rerun

Rerunning is safe. Every step looks up the existing resource before creating
one, and the generated secrets and the Resend key are reused from an existing
`<out>/growth.env`, so Vercel values are not rotated. The vendor steps and the
Neon stores and connections make no writes on a rerun. The Vercel bootstrap re-applies env vars and project
settings on every run (idempotent upserts) and re-sets the
`VERCEL_PROJECT_ID_*` GitHub secrets.

A 423 or 429 from PostHog or Resend is retried
automatically; if the run still fails, rerun it.

## Clean up

Revoke the PostHog and Resend provisioning tokens when you are done,
and remove them from the `.env` you used. Do not revoke the Vercel token: it
is the CI deploy token. Keep `<out>/growth.env` private; it holds
live secrets and is gitignored.
