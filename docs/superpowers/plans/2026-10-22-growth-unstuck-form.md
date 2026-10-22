# Growth Get Unstuck Form (PR 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Get unstuck" form on hashbrown.dev: a `/unstuck` page whose submission becomes an approved contact with a recorded consent notice, an acknowledgement email, a founder notification carrying the question, and enrollment in the founder sequence, linked from the docs menu, the site footer, the package READMEs and the development console. After this PR, a submission on a deployment with the form switched on lands in Neon and is picked up by the lifecycle tick; mail still goes out only when PR 7 turns delivery on.

**Architecture:** Ported from threadplane's contact form (reference checkout `/Users/blove/repos/angular-agent-framework`; condensed survey in the side-session note `growth-pr6-threadplane-form-survey.md`): `apps/website/src/app/api/leads/route.ts` + `src/lib/growth/form-route.ts` + `form-policy.ts` become `www/src/app/%5F/forms/unstuck/route.ts` + `www/src/lib/growth/form-route.ts`; `libs/growth/src/lib/{forms,form-admission,form-abuse}.ts` become the same files in `tools/growth/src/lib`; `apps/website/src/app/contact` + `components/contact/ContactForm.tsx` + `components/form/*` become `www/src/app/unstuck` + `www/src/components/unstuck/*`. hashbrown already has the approval half (`approveContactFromFormInTransaction` writes `form:<id>:accepted` and `form:<id>:accepted:outreach-approved`), the job handlers (`fulfill`, `notify` in `tools/lifecycle/src/campaign/send.ts`), enrollment with reason `unstuck_form`, `nudgeLifecycle`, the analytics events and the announcements catalog. Differences from threadplane: one form kind (`unstuck`) with a `framework` select and a required message; Zod 4 validation at the route (design §8.4); the founder notification carries the question (threadplane's deliberately did not); `notify` is enqueued for every accepted, unsuppressed submission; one switch gates the form until launch.

**Tech Stack:** Next.js 16 route handlers and React client components in `www`, zod 4 (already a root dependency), the growth library over `@neondatabase/serverless`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §8.2, §8.4, §10, §11, §14 item 6; PR 5 plan and runbook (`docs/superpowers/plans/2026-10-21-growth-lifecycle-service.md`, `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md`).

## Open questions for Brian (answer before Task 1)

1. **Launch gate.** The form writes real contacts, and the acknowledgement waits in the queue until PR 7 turns delivery on. My call: a switch `GROWTH_UNSTUCK_FORM_ENABLED` (exact `true`/`false`, default off) on www. While off, `/unstuck` shows the page with a "write to Brian" fallback instead of the form, and the route answers 503. PR 7 turns it on after delivery. OK, or ship the form live now?
2. **Fallback address.** The design's failure state offers `mailto:brian@hashbrown.dev`, which does not exist yet. Which address goes in the fallback and the failure state until the mailbox exists?
3. **Console announcement.** Core's collector accepts only `hashbrown.dev/docs/...` links. My call: the runtime entry's text reads "Stuck on your first stream, tool call or component? Ask Brian, Hashbrown's founding engineer: hashbrown.dev/unstuck" with `documentationUrl` pointing at the collection docs page (`/docs/react/platform/collection` for React, `/docs/angular/platform/collection` for Angular), for `@hashbrownai/react` and `@hashbrownai/angular` from `0.8.0`, expiring after 180 days. It also becomes the newest site pill entry, replacing the v0.7 pill. OK?

## Global Constraints

- Public copy never uses the word "tracking". Every field label, error and status copy below is verbatim from design §8.4 unless marked "author's call".
- Form fields (design §8.4): Email (required, full address; error "Enter a full address, like jordan@acme.dev."); Framework (required select: React, Angular, Both, Not sure yet → `react | angular | both | not_sure`); "Where are you stuck?" (required textarea, 20 to 1,000 characters after trimming); the disclosure paragraph "By sending, you agree Brian may follow up by email about your request, including a short three-email note about building with Hashbrown. Unsubscribe anytime." placed between the last field and the button and referenced by the button's `aria-describedby`. Success: "Got it. Brian reads every one of these and replies from brian@hashbrown.dev." Failure offers the fallback address (open question 2).
- The disclosure text and its version are the consent record: stored verbatim as `notice_text` / `notice_version` on the `contact.form_submission` activity. Policy version constant `UNSTUCK_FORM_POLICY_VERSION = 'unstuck_v1.2026-10-22'`; a missing or stale `policy_version` gets 409 with the current version and `Retry-After: 0`.
- Route `POST /_/forms/unstuck`: `content-type: application/json` only; body ≤ 8,192 bytes through `readBoundedBody`; Zod 4 strict schema; client-generated UUID v4 `submission_id`, reused by the client for byte-identical retries; email through `normalizeRecipientEmail` and never echoed or logged; trusted IP only from `x-vercel-forwarded-for` when `VERCEL === '1'`; rate limits 5 per hour per email HMAC and 20 per hour per IP in `growth_collection_budgets` (bucket keys `form:email:<hmac>`, `form:ip:<hmac>`), fail-open on a limiter fault, 429 with `Retry-After`; honeypot field `website_url`; abuse score ≥ 80 or honeypot → silent 200 `{ ok: true }`, no jobs, no nudge; one transaction; database closed before responding; `nudgeLifecycle({ submissionId })` only after commit and close, failures swallowed. Statuses: 200 `{ ok: true }`, 400 `{ error }` (no field values), 409 stale, 429, 503 `{ error, retryable: true }`. Every response `Cache-Control: no-store`.
- Jobs per accepted, unsuppressed submission (keys from the submission id): `fulfill` (`form:<id>:fulfill`, payload `{ form_kind: 'unstuck', submission_id }`) and `notify` (`form:<id>:notify`, same payload), `available_at` = now, `on conflict (idempotency_key) do nothing`. `send_step`s come only from enrollment (`unstuck_form`). Never re-enqueue a sent job (PR 5 Ruling 9).
- Activity `contact.form_submission` data carries `form_kind: 'unstuck'`, `submission_id`, `framework`, `message` (≤ 1,000), `notice_text`, `notice_version`, `policy_version`, `source: 'website'`, `source_form: 'unstuck'`. The message is read only by the founder notification; it never reaches PostHog, logs, or any other email.
- Analytics: `marketing:unstuck_form_submit | _success | _fail` with `surface: 'unstuck'`, `source_page`, and on fail `error_reason ∈ api_error | network_error | rate_limited | stale_form`; nothing else.
- Tests: top-level `test(...)` only (no describe/it/beforeEach/afterEach), arrange/act/assert with blank lines, TSDoc on every export, React components pure (no effects for derivable state), `npx nx <target> <project>`. Before the PR: `npx nx build growth && npx nx test growth && npx nx lint growth && npx nx build lifecycle && npx nx test lifecycle && npx nx lint lifecycle && npx nx test www && npx nx lint www && npx nx build www`, plus `GROWTH_INTEGRATION=1 npx nx test-integration growth` against the test store.

## Review Focus

1. A double-clicked or network-retried Send must produce one contact, one consent record and one set of jobs, and a retry with changed text must be rejected rather than merged (Task 1 test "replaying a submission id returns the original result and a changed payload conflicts", integration).
2. A visitor who previously unsubscribed and writes for help must get the acknowledgement and reach Brian, but never re-enter the email sequence; a complained or hard-bounced address must get nothing (Task 1 tests "prior unsubscribe still gets fulfill and notify but no approval" and "complaint suppresses all mail").
3. A slow or failing lifecycle nudge must never turn a committed submission into an error the visitor sees (Task 2 test "nudge failure still answers 200").
4. Keyboard and screen-reader users must reach every error and the disclosure: first invalid field focused, errors referenced by `aria-describedby`, disclosure referenced by the button (Task 3 tests).
5. With the switch off, nothing on the site may post to the route or promise a reply that will not come (Task 3 test "switch off renders the fallback and no form", Task 2 test "switch off answers 503 before reading the body").

---

### Task 1: Form intake in the growth library

**Files:**

- Create: `tools/growth/src/lib/forms.ts` (+ spec), `tools/growth/src/lib/form-admission.ts` (+ spec), `tools/growth/src/lib/form-abuse.ts` (+ spec), `tools/growth/test/forms.integration.spec.ts`
- Modify: `tools/growth/src/lib/contacts.ts` (`FormSubmittedFacts` = `{ submission_id, form_kind: 'unstuck', framework, message }`; drop `paper`, `pilot_interest`, `team_size`, `timeline`, `acquisition_session_id`), `tools/growth/src/lib/jobs.ts` (add `readNotificationSubmission`, moved from `tools/lifecycle/src/campaign/send.ts`), `tools/lifecycle/src/campaign/send.ts` (import it from growth), `tools/growth/src/index.ts`

**Interfaces:**

- `UnstuckFramework = 'react' | 'angular' | 'both' | 'not_sure'`; `UnstuckSubmission = { framework: UnstuckFramework; message: string }`.
- `acceptFormSubmission(executor, input: AcceptFormSubmissionInput, deps?): Promise<{ accepted: true; approved: boolean; contactId: string; submissionId: string; deliverySuppressed?: true }>` where input is threadplane's minus `form` kinds/enrichment: `{ submissionId; email; form: UnstuckSubmission; noticeText; noticeVersion; policyVersion; occurredAt; keyring; honeypot?; trustedClientIp? }` (`source: 'website'`, `sourceForm: 'unstuck'` fixed inside).
- `form-admission.ts`: `FormRateLimitError(retryAfterSec)`, `prepareFormAdmission`, `recordFormAdmission` as threadplane (request digest HMAC, advisory locks on submission and email, replay record `form:<id>:assessment` of kind `form.abuse_assessed`, rapid identity change, hourly budgets with the limits above inside a savepoint).
- `form-abuse.ts`: `FORM_ABUSE_VERSION = 'form-abuse-v1'`, `FORM_ABUSE_THRESHOLD = 80`, `assessFormAbuse(facts)` verbatim from threadplane (the name/company signals become no-ops since the form has neither field; keep message, placeholder email, rapid identity change and honeypot).
- Job enqueue SQL as threadplane's `growth:enqueue-form-jobs`, with `fulfill` and `notify` both enqueued whenever the submission is accepted and not suppressed (author's call: Brian reads every question, including from someone who unsubscribed earlier).
- `readNotificationSubmission(executor, { jobId }): Promise<{ framework: string | null; message: string | null } | null>` unchanged in behaviour.

- [ ] **Step 1: Write the failing tests**

```ts
test('accepts an unstuck submission: one contact, consent record with notice text and version, fulfill and notify jobs', ...); // integration
test('replaying a submission id returns the original result and a changed payload conflicts', ...); // Review Focus 1, integration
test('concurrent identical submissions create exactly one contact, activity set and job set', ...); // integration
test('prior unsubscribe still gets fulfill and notify but no approval', ...); // Review Focus 2, integration
test('complaint suppresses all mail and returns deliverySuppressed', ...); // Review Focus 2, integration
test('honeypot and abuse score >= 80 are recorded without jobs or approval', ...);
test('sixth submission for one email within the hour throws FormRateLimitError with a bounded Retry-After', ...); // integration
test('a limiter fault fails open', ...);
test('message outside 20..1000 characters and an unknown framework are rejected before the transaction', ...);
test('enrollment picks up an accepted unstuck approval with reason unstuck_form', ...); // integration
test('readNotificationSubmission reads framework and message from the accepted submission', ...); // moved test
```

- [ ] **Step 2:** Run `npx nx test growth` and the integration command (test store). Expected: FAIL.
- [ ] **Step 3:** Port and adapt.
- [ ] **Step 4:** Run `npx nx build growth && npx nx test growth && npx nx lint growth`, the growth integration suite, and `npx nx test lifecycle`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): Get unstuck form intake with rate limits, abuse checks and replay safety`

---

### Task 2: The `/_/forms/unstuck` route

**Files:**

- Create: `www/src/lib/growth/form-route.ts` (`trustedFormClientIp`, `jsonResponse`, `UNSTUCK_FORM_POLICY_VERSION`, `UNSTUCK_FORM_DISCLOSURE`, `unstuckFormEnabled(env)`), `www/src/app/%5F/forms/unstuck/route.ts`, `www/test/growth/unstuck-route.spec.ts`, `www/test/growth/form-route.spec.ts`
- Modify: `tools/vercel/bootstrap.mjs` (www `env` gains `GROWTH_UNSTUCK_FORM_ENABLED`) + its test, `.env.example`

**Interfaces:**

- `createUnstuckRoute(deps = defaultDependencies()): { POST(request: Request): Promise<Response> }` with `deps = { enabled: () => boolean; accept: typeof acceptFormSubmission; createDatabase; loadKeyring; now; nudge: typeof nudgeLifecycle }`.
- Zod 4 schema (strict): `{ policy_version: string, submission_id: uuidv4, email: string ≤ 254, framework: enum, message: string trimmed 20..1000, website_url?: string ≤ 200 }`.
- Order: switch off → 503 before reading the body; content type and bounded body → 400; policy version → 409; schema → 400; email → 400 "Valid email required"; keyring/database → 503; accept (429 / 503); close → 503; suppressed → 200 without nudge; else nudge then 200.

- [ ] **Step 1: Write the failing tests**

```ts
test('switch off answers 503 before reading the body', ...); // Review Focus 5
test('commits, closes the database, then nudges, and answers 200', ...);
test('nudge failure still answers 200', ...); // Review Focus 3
test('missing or stale policy version answers 409 with the current version and Retry-After 0', ...);
test('non-JSON, oversized, wrong content type and schema failures answer 400 without echoing values', ...);
test('a short message, a bad framework and a bad email each answer 400', ...);
test('rate limit answers 429 with Retry-After and no nudge', ...);
test('a suppressed submission answers a silent 200 without nudging', ...);
test('trusted IP comes only from x-vercel-forwarded-for on Vercel', ...);
test('database, keyring or close failures answer 503 retryable without secrets', ...);
test('bootstrap lists GROWTH_UNSTUCK_FORM_ENABLED for www', ...);
```

- [ ] **Step 2–4:** fail, implement, `npx nx test www && npx nx lint www && npx nx build www` and `node --test tools/vercel/*.test.mjs`.
- [ ] **Step 5: Commit** `feat(www): POST /_/forms/unstuck with consent record, limits and lifecycle nudge`

---

### Task 3: The `/unstuck` page and form

**Files:**

- Create: `www/src/app/unstuck/page.tsx`, `www/src/components/unstuck/UnstuckForm.tsx` (+ `.module.css`), `www/src/components/unstuck/use-unstuck-form.ts`, `www/test/unstuck/page.spec.tsx`, `www/test/unstuck/unstuck-form.spec.tsx`, `www/test/unstuck/use-unstuck-form.spec.tsx`
- Modify: `www/src/tools/route-report.ts` (`/unstuck` in `otherRoutes`), page metadata/share card as the privacy page does

**Interfaces:**

- Server page reads `unstuckFormEnabled(process.env)` and passes `{ enabled, policyVersion, disclosure, fallbackAddress }` to the client form; title "Get unstuck: Hashbrown"; layout like `/privacy` (Header, blog panel, Footer). Heading and lede are the author's call ("Stuck? Ask Brian." / one sentence that Brian is the founding engineer and reads every one).
- `useUnstuckForm({ policyVersion })` → `{ status: 'idle' | 'pending' | 'sent' | 'failed' | 'stale'; submit(facts); reset() }`: in-flight guard, `submission_id` reused while facts are byte-identical, 409 → `stale`, events submit/success/fail as Global Constraints.
- Form: `noValidate`; honeypot `website_url` (hidden, `tabIndex={-1}`, `aria-hidden`); email validated on blur and re-validated on change while erroring; framework required; message counter and 20..1,000 check; on submit, focus the first invalid field; errors `<p id="<field>-error">` referenced by the control's `aria-describedby` with `aria-invalid`; disclosure `<p id="unstuck-disclosure">` before the button with `aria-describedby="unstuck-disclosure"`; status regions `role="status"` (sent) and `role="alert"` (failed, stale). Switch off → the page shows the fallback ("Write to Brian at <fallback address>") and renders no form.

- [ ] **Step 1: Write the failing tests**

```ts
test('switch off renders the fallback and no form', ...); // Review Focus 5
test('renders every field, the disclosure before the button, and the button describes it', ...); // Review Focus 4
test('email is validated on blur with the design copy and re-validated on change', ...);
test('submit focuses the first invalid field and sends nothing', ...); // Review Focus 4
test('a valid submission posts the envelope once, shows the success copy and fires submit then success', ...);
test('a retry with identical facts reuses the submission id; changed facts mint a new one', ...);
test('409 shows the refresh screen and fires no success', ...);
test('a failed request offers the fallback address and fires fail with error_reason', ...);
```

- [ ] **Step 2–4:** fail, implement, `npx nx test www && npx nx lint www && npx nx build www`.
- [ ] **Step 5: Commit** `feat(www): /unstuck page and form`

---

### Task 4: Links, console announcement, privacy and docs

**Files:**

- Modify: `www/src/components/menus/DocsMenu.tsx` (a "Stuck? Ask Brian" link to `/unstuck` after the sections), `www/src/components/site/Footer.tsx` (+ `www/test/site/footer.spec.tsx`), `www/src/lib/announcements/catalog.ts` (+ spec) per open question 3, `www/content/privacy.md` (the form and the founder install digest have launched; a contact may also be approved when a development runtime links to an install whose Git email is on a work domain; what each sends and how to stop it), `www/content/docs/{react,angular}/platform/collection.md` (a "Getting help" line), the ten `packages/*/README.md` (one line under "What this package sends" or the support section: "Stuck? Ask Brian at https://hashbrown.dev/unstuck."), `docs/growth/taxonomy.md` (the unstuck events are live)

- [ ] **Step 1: Write the failing tests**

```ts
test('docs menu ends with a Stuck? Ask Brian link to /unstuck', ...);
test('footer links /unstuck', ...);
test('the unstuck runtime entry reaches React and Angular collectors from 0.8.0 with a docs link and is the current site pill', ...);
test('privacy describes the form, the install digest and install-runtime approval as live', ...); // string checks on privacy.md
test('every package README links https://hashbrown.dev/unstuck', ...); // in tools/growth/src/lib/packaging.spec.ts or a www content spec
```

- [ ] **Step 2–4:** fail, implement, `npx nx test www && npx nx lint www && npx nx build www && npx nx test growth` (README packaging spec), `npx nx run-many -t build -p core react angular` only if READMEs are part of a packaging check.
- [ ] **Step 5: Commit** `docs: link Get unstuck from the docs menu, footer, READMEs and console; update privacy`

---

### Task 5: Runbook and live verification

**Files:**

- Modify: `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md` (the form path, `GROWTH_UNSTUCK_FORM_ENABLED`, enable order: the form switch goes on after `DELIVERY_ENABLED` and campaign enrollment), `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §8.4 and §14 item 6/7 (the switch, the notify rule)

- [ ] Local verification against the test store (the PR 5 dogfood approach; Vercel Preview cannot scope env to a branch): `next dev` for www with the test-store `DATABASE_URL`, `GROWTH_UNSTUCK_FORM_ENABLED=true`, and `LIFECYCLE_URL` pointing at a local `b4 dev` lifecycle with delivery off. Submit the form in the in-app browser: expect 200, one contact with `form:<id>:accepted` and the consent text, `fulfill` and `notify` jobs, a nudge that runs a tick, and enrollment with reason `unstuck_form` once the tick runs. Re-submit unchanged: one set of rows. Six submissions for one address: the sixth gets 429. Honeypot filled: silent 200, no jobs. Switch off: fallback page, route 503. Clean every row created (contacts, activity, jobs, scores, budgets with the `form:` prefix, `campaign:v1:configuration`); confirm both integration suites pass afterwards.
- [ ] **Commit** `docs(growth): Get unstuck form runbook and design notes`

---

## Not in this PR

Turning `GROWTH_UNSTUCK_FORM_ENABLED`, delivery or the campaign on (PR 7); the reply poller (waits for the mailbox); the hardening items listed for PR 7 in the lifecycle runbook.
