# Get unstuck page polish: design

Date: 2026-10-25. Status: draft for Brian's approval.

## Intent

`/unstuck` on hashbrown.dev is where a developer or team lead who is building
an agent with Hashbrown and has hit a wall writes to Brian directly. Today it
looks unfinished: a bare left-aligned form floating in the empty blog panel,
with none of the home page's display type, centring or card treatment. It
speaks about Brian in the third person, its error messages were written ad hoc,
it asks for a framework that does not change anything, and it carries a
legal-sounding consent paragraph whose stored "agreement" Brian does not want.

This work makes the page feel like part of hashbrown.dev and like a note from
Brian himself, engineer to engineer, and strips the form down to what he needs
to answer: an email address and where the person is stuck. Alongside it, the
growth sending setup gets two small alignments with threadplane's (cron
cadence, no stored agreement) and the growth spec is corrected where it has
drifted from the code.

## Goals

1. A focused, centred page in the site's visual language (layout "B" below).
2. Every word in Brian's first-person voice.
3. Two fields: email and "Where are you stuck?". Framework is removed
   end to end.
4. Every field validates when it loses focus, with the new copy below.
5. No consent disclosure on the page and no agreement text or policy version
   stored anywhere for form submissions.
6. The lifecycle cron runs every 30 minutes, as threadplane's does.
7. The growth spec and runbook match the code again.

## Non-goals

- Changing the founder sequence (copy, three steps, 3 then 5 business days,
  Monday to Friday 07:00 Pacific window), the acknowledgement or internal
  notification beyond dropping the framework line, the unsubscribe flow,
  bounce and complaint handling, scoring, or the install digest.
- Changing reply stops. Hashbrown keeps content-based stops (a reply stops the
  sequence only when it asks to leave, `tools/growth/src/lib/reply-intent.ts`);
  Brian explicitly declined threadplane's stop-on-any-reply.
- Removing or renaming `outreach_approved_at` or the `form.outreach_approved`
  activity kind. It stays as the plain "okay to email this person" flag every
  send is checked against, as in threadplane (see "Approval" below).
- Adding threadplane-only machinery: the `project.claimed` approval path, Dawn
  enrichment and evidence variants, extra acknowledgement emails, more forms.
- Changing threadplane.
- Changing the install-runtime approval path (it already enrolls: see
  "Install path, confirmed" below).

## Anti-goals

- Anything on the page that pulls a stuck person away from writing to Brian:
  no links to docs, GitHub issues, the demo or other channels inside the page
  body (the site header and footer stay as they are everywhere).
- A promised reply time. Nothing on the page commits to "within a day" or
  similar.
- The word "tracking" in any public copy (existing rule).
- Personal data in analytics events (existing rule: `marketing:unstuck_form_*`
  carry the surface and an error reason only).

## The page

### Layout ("B, focused card", chosen by Brian)

Mockup: `.superpowers/brainstorm/83575-1792961415/content/directions.html`,
option B (local only, not committed). The final arrangement differs from that
mockup in that the framework select is gone, the email field spans the card,
and there is no disclosure.

- Site `Header` and `Footer` stay. The page no longer renders inside the empty
  white blog panel. It sits on the site's ivory background (`--vanilla-ivory`)
  like the home page.
- One centred column, about 520 to 560px wide, with a 16px side gutter on
  phones and no horizontal scroll.
- At the top, centred: the display headline in the home page's heading style
  (chocolate brown, `--font-heading`, heavy weight, large), then the lede in
  Fredoka body text.
- Below that, one white card with the soft shadow used elsewhere on the site,
  holding the whole form:
  1. "Your email", full width.
  2. "Where are you stuck?", full width textarea, with the hint and the
     character count beneath it.
  3. A row with the yellow **Send** button on the left and, on the right in
     small muted text, "Rather email? brian@hashbrown.dev" as a `mailto:`
     link. On narrow screens the link wraps below the button.
- The sent and failed states render inside the same card so the page does not
  jump. With the form switched off, the card holds only the off-state line.

### Copy (Brian's first person)

| Where | Copy |
| --- | --- |
| Headline (`h1`) | Stuck? Tell me where. |
| Lede | I'm Brian, founder of Hashbrown. I'd love to help you, engineer to engineer. |
| Email label | Your email |
| Message label | Where are you stuck? |
| Message hint | What you expected, what happened instead, and any error text. |
| Count | `{n} / 1,000` (unchanged) |
| Button | Send (pending: "Sending…") |
| Beside button | Rather email? brian@hashbrown.dev |
| Email empty | I need your email to write back. |
| Email malformed | That doesn't look like a full address. Try something like jordan@acme.dev. |
| Message too short | Give me a bit more to go on, at least 20 characters. |
| Message too long | That's over 1,000 characters. Send the short version and we'll go from there. |
| Sent | Got it. A confirmation is on its way, and I'll reply from brian@hashbrown.dev. |
| Failed | That didn't send. Try again, or email me at brian@hashbrown.dev. |
| Form switched off | Email me at brian@hashbrown.dev. |
| Page `<title>` | Get unstuck: Hashbrown (unchanged) |
| Meta / share description | Stuck building with Hashbrown? Tell me where. |

Brian wrote "hashbrown" in lower case; the copy uses "Hashbrown" to match the
rest of the site's prose (author's call).

The fallback address comes from `UNSTUCK_FALLBACK_ADDRESS`, not a literal, in
every place it appears (today the sent state hard-codes it).

### Validation

- Both fields validate when they lose focus, including when empty (the email
  field already behaves this way; the message field gains it).
- While a field shows an error, it re-validates on every change so the error
  clears as soon as the value is fixed (existing behaviour, kept).
- On Send, both fields validate; focus moves to the first invalid one
  (existing behaviour, kept).
- Rules are unchanged: email trimmed, loose shape check, at most 254
  characters; message trimmed, 20 to 1,000 UTF-16 code units, measured as the
  server measures it.
- Accessibility kept: errors linked with `aria-describedby` and
  `aria-invalid`; the message's `aria-describedby` also lists the hint and the
  count; status messages take focus as they mount (`role="status"` for sent,
  `role="alert"` for failed).
- Honeypot (`website_url`), one-request-at-a-time guard and the
  `submission_id` reuse for byte-identical retries stay.

### Removed from the page

- The framework select and its error copy.
- The consent disclosure paragraph and the button's `aria-describedby` to it.
- The "This page is out of date" state and its Refresh button. That state
  exists only to stop a submission made against an old disclosure version.

## Behind the form

### Request and route (`www/src/app/%5F/forms/unstuck/`)

- The body becomes `{ submission_id, email, message, website_url? }`.
- `policy_version` and `framework` are no longer sent. The route stops
  checking the policy version and no longer answers 409.
- Transition (author's call): pages already open in browsers when this ships
  still send `policy_version` and `framework`. The route accepts those two keys
  if present and ignores them, so those people's messages still go through
  instead of failing. Remove the tolerance in a later cleanup; it is harmless
  meanwhile.
- `UNSTUCK_FORM_DISCLOSURE` and `UNSTUCK_FORM_POLICY_VERSION` are deleted from
  `www/src/lib/growth/form-route.ts`; the page stops passing them to the form.
- `useUnstuckForm` loses its `policyVersion` option, the `stale` status and the
  409 branch. The `stale_form` error reason disappears from
  `marketing:unstuck_form_fail`; other events are unchanged. If a PostHog
  dashboard or insight in `tools/posthog` filters on `stale_form`, remove it.

### Growth library (`tools/growth`)

- Framework: remove `UNSTUCK_FRAMEWORKS` / `UnstuckFramework` and the
  `framework` field from the form submission types, validation, admission
  digest and stored submitted facts (`models.ts`, `forms.ts`,
  `form-admission.ts`, `contacts.ts`). `readFormSubmission`-style readers in
  `jobs.ts` already treat a missing framework as `null`.
- Agreement: remove `noticeText`, `noticeVersion` and `policyVersion` from the
  form path (`AcceptFormSubmissionInput`, the contact-approval input and its
  validation, and the stored form request data in `contacts.ts`), and
  `policy_version` from `FormOutreachApprovedActivityData`. A form submission
  still sets `outreach_approved_at` exactly as today.
- Scoring (author's call): `isVerifiedWorkApproval` in
  `tools/growth/src/lib/scoring.ts` currently counts a form approval only when
  its data has a non-empty `policy_version`. Relax it to rely on the remaining
  facts (`verification: 'server_verified'`, source form, work email
  classification) so form-approved contacts keep their verified-work points
  and the digest and funnel ordering do not change. Scores in
  `growth_contact_scores` are recomputed by the normal scoring pass; if that
  pass skips unchanged contacts, recompute the affected ones once after the
  migration.
- Replays across the deploy (author's call): `prepareFormAdmission` fingerprints
  a submission from its fields, including the ones being removed. A resend of a
  submission accepted *before* the deploy, with the same `submission_id`, will
  no longer match and gets the existing 422, which the person sees as the
  failed state with the email fallback. That window is a network failure
  spanning the deploy and production holds only a handful of form rows, so no
  compatibility path is built for it. New submissions after the deploy replay
  normally.
- Existing rows (author's call, "clean up any agreement being stored"):
  migration `0011` (main already has `0010_growth_drop_gmail_schema.sql`)
  strips the `notice_text`, `notice_version` and
  `policy_version` keys from the `data` of existing form-submission and
  `form.outreach_approved` activity rows, and the `framework` key from stored
  form submission facts. It is applied to production by hand after merge, like
  migrations 0009 and 0010. Production holds only a handful of form rows (the
  2026-10-23 canary and anything since).
- Left alone: the `'growth-v1'` policy tag on install-runtime and founder
  approvals. That tag records which rules approved a contact, not text anyone
  agreed to.

### Lifecycle (`tools/lifecycle`)

- The internal "new submission" email to Brian drops its framework line for
  form submissions (it currently prints "not given" when none is recorded). The
  install digest keeps its framework, which is detected from the runtime.

### Approval, as it stands after this change

Every send still requires `outreach_approved_at`. It is set by three paths,
unchanged: an accepted Get unstuck form, the founder's approve link in the
install digest, and the install-runtime hello. Stops (unsubscribe, a reply
asking to leave, bounce, complaint) still clear it, and a plain form
submission still cannot re-approve a stopped contact.

### Install path, confirmed (no change)

Brian asked whether installing from npm and then running Hashbrown enrolls
someone. It does, under conditions, per
`tools/growth/src/lib/observability/install-runtime.ts`: the install records
`package.installed` with an installation token and the Git email if
configured; the first development session sends `runtime.session_started`,
whose acknowledgement carries the console announcements; the next lifecycle
run links the two by token and approves the contact when there is exactly one
email, it is a work domain, the install was not on CI, nothing is redacted and
the contact is not stopped or deleted. Approved contacts enter the same
three-email sequence. Installs without a Git email or with a personal domain
are not enrolled; they still appear in the founder digest for manual approval.

## Cron

`www/vercel.json`: `/_/cron/lifecycle` moves from `*/10 * * * *` to
`*/30 * * * *`, matching threadplane. `/_/cron/inbox-recovery` stays at
`*/5`. Update `www/test/redirects.spec.ts`, which asserts the schedule. The
form keeps nudging lifecycle right after it saves, so acknowledgements are not
delayed; install-runtime approvals may wait up to 30 minutes, which is fine.

## Documentation

- `www/content/privacy.md`, "Get unstuck": "we keep your email address and
  your question" (drop "your framework" and "along with your agreement to hear
  back from us"). The paragraph about the acknowledgement, the three emails
  from Brian and unsubscribing stays.
- Growth spec `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md`:
  - §1 goals and §8.2 path 1: the form enrolls without a disclosure; no notice
    text or version is recorded.
  - §8.4: two fields, the new copy, layout and validation; no disclosure, no
    policy version, no 409. Point to this document.
  - §8.3 and the architecture diagram: cron `*/30` (already says so; confirm
    it matches after the change).
  - Remove the Gmail poller from the diagram and §8.6 / the reply sections
    (`/_/growth/replies/google`, `gmail_seed_message_id`, BCC-for-poller);
    replies arrive through Resend receiving and stop only on opt-out phrases
    (#717, #744, #753).
- Runbook `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md`:
  cron line to `*/30`; drop any step that mentions the disclosure, the policy
  version or the stale-page 409.

## Constraints

- Nx monorepo; run build, test and lint for `www`, `growth` and `lifecycle`,
  plus `npx nx test-integration growth` and `lifecycle` with the test database.
- Tests first, top-level `test(...)`, arrange/act/assert (AGENTS.md).
- No new dependencies.
- Production is live: the form is on (`GROWTH_UNSTUCK_FORM_ENABLED=true`) and
  real people are enrolled. The migration that strips stored keys is applied to
  production by hand after merge, in a read-write transaction, with a
  before/after count logged in the runbook's enable log.

## Left to the builder

- Exact spacing, type sizes and shadow values within the site's existing
  tokens; how the page escapes the blog panel (new layout class or a variant of
  `SectionShell`).
- Whether the hint and count share one line.
- How the migration identifies the affected activity rows, as long as it
  touches only form-submission and `form.outreach_approved` rows.
- Test fixture and spec updates across `www/test/unstuck`, `www/test/growth`
  and `tools/growth` that follow from the removals.
