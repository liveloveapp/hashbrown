# Growth provisioning runbook

Provisions the growth layer's vendors (Neon, PostHog, Resend, Vercel) and
writes the environment variables to the `hashbrown-www` and
`hashbrown-lifecycle` Vercel projects. Design: section 14 of
`docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md`.

## Tokens

Put these in a private file outside the repo, for example
`~/hashbrown-provision.env`:

```
NEON_API_KEY=
POSTHOG_PERSONAL_API_KEY=
RESEND_PROVISION_API_KEY=
VERCEL_TOKEN=
FOUNDER_NOTIFICATION_EMAIL=brian@hashbrown.dev
```

- **Neon**: an API key for the account that will own the `hashbrown-growth`
  project (Account settings, API keys).
- **PostHog**: a personal API key with the `organization:read` and
  `project:write` scopes.
- **Resend**: a full-access API key (it creates the domain and the
  sending-only key).
- **Vercel**: an account token for the team that owns the hashbrown projects.

Tokens are read only from `--env-file` or the process environment. They are
never written to the output, the logs, or the checklist.

## Run

```
node tools/growth/scripts/provision/index.mjs --env-file ~/hashbrown-provision.env
```

`--out <dir>` changes where the output goes (default
`tools/growth/.provision`, gitignored). The script:

1. Provisions the Neon project, branches, and databases.
2. Provisions the PostHog project.
3. Provisions the Resend domain, its DNS records on Vercel, and a
   sending-only key.
4. Writes `<out>/growth.env` (mode 0600) with the generated secrets, the
   vendor values, and every rollout switch set to `false`.
5. Runs `tools/vercel/bootstrap.mjs --env-file <out>/growth.env
   --skip-workflow`, which upserts production values and `PREVIEW_`-prefixed
   preview values on both Vercel projects. The `OPENAI_*` keys are not in
   that file, so the www target reports them `missing`; that is expected.
6. Prints the checklist.

## Manual steps

The checklist ends with these:

1. **Resend webhook secret**: create a webhook at
   https://resend.com/webhooks for `https://hashbrown.dev/_/webhooks/resend`
   with the events listed in the checklist line, then set
   `RESEND_WEBHOOK_SECRET` on `hashbrown-www` and `hashbrown-lifecycle`.
2. **Mailbox**: create the `brian@hashbrown.dev` Google Workspace mailbox.
3. **Preview values**: set `PREVIEW_GROWTH_PUBLIC_ACTION_ORIGIN`,
   `PREVIEW_LIFECYCLE_URL`, and `PREVIEW_RESEND_NON_PRODUCTION_*` once the
   preview lifecycle URL exists.

If Resend's sending key already existed and no earlier `growth.env` holds it,
the checklist also lists a manual step to create a new key, because Resend
shows a key only once.

## Rerun

Rerunning is safe. Every step looks up the existing resource before creating
one, and the generated secrets and the Resend key are reused from an existing
`<out>/growth.env`, so Vercel values are not rotated. The only write on a
fully provisioned account is Resend's domain verification request.

## Clean up

Revoke the Neon, PostHog, Resend, and Vercel tokens when you are done, and
delete `~/hashbrown-provision.env`. Keep `<out>/growth.env` private; it holds
live secrets and is gitignored.
