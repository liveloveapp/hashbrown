# Get unstuck page polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/unstuck` as a focused, first-person page with a two-field form that validates on blur, and remove the framework field, the consent disclosure and every stored agreement from the form path; move the lifecycle cron to every 30 minutes and correct the growth docs.

**Architecture:** The growth library's form path (`tools/growth`) and the www route that calls it change together so every commit stays green: submissions become `{ submission_id, email, message, website_url? }`. Framework then leaves the founder notification (`tools/growth` jobs reader + `tools/lifecycle`). A hand-applied migration strips the old keys from stored rows. The client hook, form and page are rebuilt last, so the route already tolerates the legacy keys old pages send.

**Tech Stack:** Next.js App Router (www), React, CSS modules, Zod 4, Vitest, Testing Library, Postgres (Neon) via the growth SQL executor, Nx.

**Spec:** `docs/superpowers/specs/2026-10-25-unstuck-page-polish-design.md`

## Global Constraints

- Tests use top-level `test(...)` only, arrange/act/assert separated by blank lines; write the failing test first (AGENTS.md).
- No new dependencies.
- Copy is Brian's first person, exactly as in the spec's Copy table; "Hashbrown" capitalised; no promised reply time; never the word "tracking" in public copy.
- Nothing on the page body links away from writing to Brian (no docs, GitHub, demo links); site `Header` and `Footer` stay.
- Analytics events stay `marketing:unstuck_form_submit|success|fail`, carrying the surface and an error reason only, never email or message.
- The fallback address always comes from `UNSTUCK_FALLBACK_ADDRESS` (`brian@hashbrown.dev`), never a literal.
- `outreach_approved_at` and the `form.outreach_approved` activity kind stay; a form submission still sets approval exactly as today.
- Reply stops, the founder sequence, the acknowledgement, scoring weights and the install digest do not change.
- The install-runtime and founder approvals keep their `'growth-v1'` policy tag.
- Message rules unchanged: trimmed, 20 to 1,000 UTF-16 code units; email trimmed, at most 254, loose shape check refusing `<` and `>`.
- Before the final response run `npx nx build|test|lint` for `www`, `growth` and `lifecycle`, plus `npx nx test-integration growth` and `npx nx test-integration lifecycle` (need `GROWTH_INTEGRATION=1` and `TEST_DATABASE_URL`); report failures and warnings.

## Review Focus

1. A page opened before the deploy still posts `policy_version` and `framework`: the message must go through (200), with neither key reaching the library. Test in Task 1.
2. A form-approved work contact whose approval carries no `policy_version` must keep its `contact.approved_work_email_form` points. Test in Task 1.
3. The migration must leave the `'growth-v1'` tag on install-runtime and founder approvals untouched, and running it twice must change nothing the second time. Test in Task 3.
4. Tabbing out of an empty message box must show the message error. Typing a valid message must then clear it without another blur. Test in Task 4.
5. With the switch off, the page shows only "Email me at brian@hashbrown.dev." in the card: no form fields and no second "Rather email?" line. Test in Task 4.

---

### Task 1: Submissions carry only email and message

Growth form path and the www route, together.

**Files:**
- Modify: `tools/growth/src/lib/models.ts` (delete `UNSTUCK_FRAMEWORKS`, `UnstuckFramework`; drop `policy_version` from `FormOutreachApprovedActivityData`)
- Modify: `tools/growth/src/lib/forms.ts` (`UnstuckSubmission`, `AcceptFormSubmissionInput`, `unstuckSubmission`, the `approveContact` call, `facts`)
- Modify: `tools/growth/src/lib/form-admission.ts:91-102` (request fingerprint)
- Modify: `tools/growth/src/lib/contacts.ts` (form-approval input type ~line 168, `FormSubmittedFacts` ~184, `LIMITS.noticeText`/`policyVersion` if now unused, validation ~465-505, approval data ~765)
- Modify: `tools/growth/src/lib/scoring.ts:286-301` (`isVerifiedWorkApproval`)
- Modify: `www/src/lib/growth/form-route.ts` (delete `UNSTUCK_FORM_POLICY_VERSION`, `UNSTUCK_FORM_DISCLOSURE` and their doc comments)
- Modify: `www/src/app/%5F/forms/unstuck/handler.ts` (schema, delete the 409 branch, `accept` call)
- Test: `tools/growth/src/lib/forms.spec.ts`, `form-admission.spec.ts`, `contacts.spec.ts`, `scoring.spec.ts`, `tools/growth/test/forms.integration.spec.ts`, `contacts.integration.spec.ts`, `install-lifecycle.integration.spec.ts`, `www/test/growth/unstuck-route.spec.ts`, `www/test/growth/form-route.spec.ts`

**Interfaces:**
- Produces:
  - `interface UnstuckSubmission { message: string }` (forms.ts)
  - `AcceptFormSubmissionInput` without `noticeText`, `noticeVersion`, `policyVersion`; `form: UnstuckSubmission`
  - `FormSubmittedFacts = { form_kind: GrowthSourceForm; submission_id: string; message: string }`
  - the contact form-approval input type (contacts.ts ~line 160) without `noticeText`, `noticeVersion`, `policyVersion`
  - `FormOutreachApprovedActivityData = { email_classification; source; source_form; verification: 'server_verified' }`
  - www route body: `{ submission_id: uuidv4, email: string ≤254, message: trimmed 20..1000 without NUL, website_url?: string ≤200 }`, plus tolerated and ignored `policy_version?: string ≤100` and `framework?: string ≤100`

- [ ] **Step 1: Update the growth unit tests to the new shapes (failing)**

In `forms.spec.ts`:
- Delete `lists the four framework choices`.
- Change `baseInput` to drop `noticeText`, `noticeVersion`, `policyVersion` and set `form: { message: '  My chat component re-renders on every streamed token.  ' }`.
- In `accepts an unstuck submission and enqueues fulfill and notify in one transaction`, the `approveContact` expectation loses the three notice keys and `submittedFacts.framework`. Use `toHaveBeenCalledWith` with the exact object, so any leftover key fails the test.

In `form-admission.spec.ts`, `replays the immutable decision without consuming a budget and rejects a changed payload` changes its "changed payload" case from framework to a changed message.

In `contacts.spec.ts`, remove the notice keys from every `approveContactFromForm` input. Add:

```ts
test('approveContactFromForm stores no notice text, notice version or policy version', async () => {
  // arrange: the existing approveContactFromForm fake executor, new-shape input
  // act: approveContactFromForm(...)
  // assert: for the growth:insert-form-submission and
  // growth:insert-form-outreach-approved queries (use the markers the file
  // already matches on), the JSON data parameter has none of
  // 'notice_text', 'notice_version', 'policy_version', 'framework'
});
```

In `scoring.spec.ts`, add:

```ts
test('a form approval without a policy version still earns the work email form points', async () => {
  // same executorWith setup as 'recomputeContactScore reads approvals…' but the
  // form.outreach_approved data omits policy_version and there is no
  // reauthorization row and no runtime row
  const result = await recomputeContactScore(executor, { contactId, now });

  expect(result.reasons).toContainEqual(
    expect.objectContaining({ code: 'contact.approved_work_email_form' }),
  );
});
```

Also remove `policy_version: 'growth-v1'` from the form approval fixture in `recomputeContactScore reads approvals and linked runtime observations and stores the score`. Its score must stay 75.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx nx test growth`
Expected: FAIL. The new and changed tests break on the extra keys, `UNSTUCK_FRAMEWORKS` validation and the missing points.

- [ ] **Step 3: Implement the growth changes**

- Delete the framework check from `unstuckSubmission`, which now only validates the message.
- Delete the three notice fields from every type and call listed above, and from the `canonicalJson` fingerprint in `prepareFormAdmission`.
- In `contacts.ts`, delete the `noticeText`/`noticeVersion`/`policyVersion` validation and the `notice_text`, `notice_version`, `policy_version` keys from the form request data and approval data. Remove `LIMITS` entries that become unused.
- In `isVerifiedWorkApproval`, delete the two `policy_version` clauses.
- Update TSDoc that mentions the disclosure, consent or framework.

- [ ] **Step 4: Run the growth tests and confirm they pass**

Run: `npx nx test growth`
Expected: PASS.

- [ ] **Step 5: Update the www route tests (failing)**

In `unstuck-route.spec.ts`:
- Make the valid request body helper send `{ submission_id, email, message }` only.
- Delete `missing or stale policy version answers 409 with the current version and Retry-After 0`.
- Change `a short message, a bad framework and a bad email each answer 400` to cover a short message and a bad email.
- Add:

```ts
test('a body from a page opened before the deploy still answers 200 and drops the legacy keys', async () => {
  // arrange: valid body plus policy_version: 'unstuck_v1.2026-10-22', framework: 'react'
  // act: POST
  // assert: status 200; accept called once; its input has no noticeText,
  // noticeVersion or policyVersion, and its form equals { message: <trimmed message> }
});

test('an unknown extra key still answers 400', async () => {
  // body plus colour: 'blue' → 400 (the schema stays strict apart from the two legacy keys)
});
```

In `form-route.spec.ts`, rename `the consent text, version and fallback address are the approved values` to `the fallback address is brian@hashbrown.dev`, and assert only `UNSTUCK_FALLBACK_ADDRESS`.

- [ ] **Step 6: Run and confirm they fail**

Run: `npx nx test www -- test/growth`
Expected: FAIL. The route still requires `policy_version` and `framework` and answers 409.

- [ ] **Step 7: Implement the route**

- In `handler.ts`, delete the 409 block and the `UNSTUCK_FORM_*` imports.
- Schema: `z.strictObject({ submission_id, email, message, website_url, policy_version: z.string().max(100).optional(), framework: z.string().max(100).optional() })`, with a one-line comment that the last two are tolerated for pages opened before 2026-10-25 and ignored.
- Call `accept` with `form: { message: form.message }` and no notice fields. Update the handler's TSDoc.
- In `form-route.ts`, delete the two constants.

- [ ] **Step 8: Update integration fixtures and run every suite**

Update `tools/growth/test/{forms,contacts,install-lifecycle}.integration.spec.ts` to the new input shape. Where a test asserted stored `notice_text`/`policy_version`, assert their absence instead.

Run: `npx nx test growth && npx nx test www -- test/growth && GROWTH_INTEGRATION=1 npx nx test-integration growth && npx nx lint growth && npx nx lint www`
Expected: all PASS, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add tools/growth www/src/lib/growth/form-route.ts "www/src/app/%5F/forms/unstuck/handler.ts" www/test/growth
git commit -m "feat(growth): unstuck submissions carry only email and message"
```

---

### Task 2: Founder notification without a framework

**Files:**
- Modify: `tools/growth/src/lib/jobs.ts:1221-1270` (`NotificationSubmission`, `readNotificationSubmission`)
- Modify: `tools/lifecycle/src/notifications/templates.ts:164-170, ~271`
- Modify: `tools/lifecycle/src/campaign/send.ts:86, ~577`
- Test: `tools/growth/src/lib/jobs.spec.ts`, `tools/lifecycle/src/notifications/templates.spec.ts`, `tools/lifecycle/src/campaign/send.spec.ts`, `tools/lifecycle/src/dispatcher.integration.spec.ts`

**Interfaces:**
- Consumes: Task 1's `FormSubmittedFacts` (no framework).
- Produces: `interface NotificationSubmission { message: string | null }`. The internal notification input's `submission` becomes `{ messagePresent: boolean; messageLength: number; message?: string }` (strict).

- [ ] **Step 1: Write the failing tests**

In `templates.spec.ts`, remove `framework` from the inputs. In `internal notification embeds the bounded message, three draft previews and a canonical founder stop URL only`, replace `toContain('Framework: react')` with `expect(summary).not.toContain('Framework:')`.

In `send.spec.ts`, remove `framework` from fixtures. In the `jobs.spec.ts` test for `readNotificationSubmission`, assert that the result equals `{ message: … }` and that the SQL no longer selects `framework`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx nx test lifecycle && npx nx test growth -- src/lib/jobs.spec.ts`
Expected: FAIL. The strict schema rejects the missing `framework`, and the summary still prints it.

- [ ] **Step 3: Implement**

- Drop `framework` from the schema, the summary line, `UNKNOWN_FRAMEWORK` and its use in `send.ts`.
- Drop `framework` from the type, the select and the return in `readNotificationSubmission`, and update its TSDoc.
- Leave the install digest's `framework` alone.

- [ ] **Step 4: Run and confirm pass**

Run: `npx nx test lifecycle && npx nx test growth && GROWTH_INTEGRATION=1 npx nx test-integration lifecycle && npx nx lint lifecycle && npx nx build lifecycle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/growth/src/lib/jobs.ts tools/growth/src/lib/jobs.spec.ts tools/lifecycle
git commit -m "feat(lifecycle): founder notification drops the framework line"
```

---

### Task 3: Migration 0011 strips stored agreement and framework keys

**Files:**
- Create: `tools/growth/migrations/0011_growth_strip_form_agreement.sql`
- Test: `tools/growth/src/lib/migrations.spec.ts`, `tools/growth/test/forms.integration.spec.ts`

**Interfaces:**
- Consumes: the activity kinds `contact.form_submission` and `form.outreach_approved` (contacts.ts).

- [ ] **Step 1: Write the failing tests**

In `migrations.spec.ts`, follow the `dead Gmail schema migration…` pattern:

```ts
test('form agreement migration strips notice, policy and framework keys from form activity only', async () => {
  const sql = await read('0011_growth_strip_form_agreement.sql');

  const statements = /* same split/normalise as the 0010 test */;

  expect(statements).toHaveLength(2);
  expect(statements[0]).toContain("kind = 'contact.form_submission'");
  expect(statements[0]).toContain("'notice_text'");
  expect(statements[0]).toContain("'notice_version'");
  expect(statements[0]).toContain("'policy_version'");
  expect(statements[0]).toContain("'framework'");
  expect(statements[1]).toContain("kind = 'form.outreach_approved'");
  expect(statements[1]).toContain("'policy_version'");
});
```

In `forms.integration.spec.ts`, add:

```ts
test('migration 0011 strips old form keys, leaves other approvals alone and is idempotent', async () => {
  // arrange: insert a contact plus three activity rows with the old shapes:
  //   contact.form_submission  { notice_text, notice_version, policy_version, framework: 'react', message, ... }
  //   form.outreach_approved   { policy_version: 'unstuck_v1.2026-10-22', verification: 'server_verified', ... }
  //   install_runtime.outreach_approved { policy_version: 'growth-v1', ... }
  // act: run the migration file's SQL twice
  // assert: the first two rows lack the stripped keys and keep message,
  // verification, source and source_form; the install_runtime row still has
  // policy_version 'growth-v1'; the second run updates 0 rows
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx nx test growth -- src/lib/migrations.spec.ts`
Expected: FAIL, file not found.

- [ ] **Step 3: Write the migration**

- Start with a header comment saying the form stopped recording agreement and framework on 2026-10-25, and that this is applied to production by hand.
- Statement 1: `UPDATE growth_activity SET data = data - 'notice_text' - 'notice_version' - 'policy_version' - 'framework' WHERE kind = 'contact.form_submission' AND data ?| array[...]`.
- Statement 2: the same for `form.outreach_approved` with `- 'policy_version'`.
- The `?|` guard makes the second run touch 0 rows.

- [ ] **Step 4: Run and confirm pass**

Run: `npx nx test growth && GROWTH_INTEGRATION=1 npx nx test-integration growth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/growth/migrations/0011_growth_strip_form_agreement.sql tools/growth/src/lib/migrations.spec.ts tools/growth/test/forms.integration.spec.ts
git commit -m "feat(growth): migration strips stored form agreement and framework"
```

---

### Task 4: The page, form and hook

**Files:**
- Modify: `www/src/components/unstuck/use-unstuck-form.ts`
- Modify: `www/src/components/unstuck/UnstuckForm.tsx`
- Modify: `www/src/components/unstuck/UnstuckForm.module.css`
- Modify: `www/src/components/unstuck/UnstuckPage.module.css`
- Modify: `www/src/app/unstuck/page.tsx`
- Test: `www/test/unstuck/use-unstuck-form.spec.tsx`, `www/test/unstuck/unstuck-form.spec.tsx`, `www/test/unstuck/page.spec.tsx`

**Interfaces:**
- Consumes: Task 1's route body and the removal of `UNSTUCK_FORM_*`.
- Produces:
  - `useUnstuckForm(): UnstuckFormController`, with no options.
  - `UnstuckFacts = { email: string; message: string; website_url: string }`.
  - `UnstuckFormStatus = 'idle' | 'pending' | 'sent' | 'failed'`.
  - `UnstuckForm({ fallbackAddress }: { fallbackAddress: string })`.

- [ ] **Step 1: Rewrite the hook tests (failing)**

In `use-unstuck-form.spec.tsx`:
- Call `useUnstuckForm()` with no options. The facts have no framework, and the posted body is `{ submission_id, email, message, website_url }` with no `policy_version`.
- Delete `409 settles as stale and fires fail with stale_form`.
- Add `a 409 is an ordinary failure`: status `failed`, and `fail` fires with `error_reason: 'api_error'`, the reason the hook already uses for other non-OK statuses. No PostHog contract change is needed, since `tools/posthog` never names `stale_form`.

- [ ] **Step 2: Rewrite the form tests (failing)**

In `unstuck-form.spec.tsx`:
- `mount()` renders `<UnstuckForm fallbackAddress={UNSTUCK_FALLBACK_ADDRESS} />`.
- `fill(email, message)` uses the labels `Your email` and `Where are you stuck?`.
- `send()` clicks the button named `Send`.
- Delete `409 shows the refresh screen…` and `focus moves to the refresh notice…`.

Replace or add these tests, with copy exactly as in the spec:

```ts
test('renders two fields, the hint, the count and the email fallback beside Send, with no disclosure', () => {
  // assert: labels 'Your email' and 'Where are you stuck?'; no 'Framework' label;
  // hint text 'What you expected, what happened instead, and any error text.'
  // is in the textarea's aria-describedby along with the count;
  // link 'brian@hashbrown.dev' with href 'mailto:brian@hashbrown.dev';
  // queryByText(/By sending/) is null; the button has no aria-describedby
});

test('email validates on blur with the new copy', () => {
  // blur empty → 'I need your email to write back.'
  // type 'jordan@acme' and blur → "That doesn't look like a full address. Try something like jordan@acme.dev."
  // type a valid address → the error clears without another blur
});

test('message validates on blur and clears as soon as it is valid', () => {
  // blur empty → 'Give me a bit more to go on, at least 20 characters.'
  // change to MESSAGE → the error is gone without another blur
  // change to 1,001 characters and blur → "That's over 1,000 characters. Send the short version and we'll go from there."
});

test('submit focuses the first invalid field and sends nothing'); // keep, two fields

test('a valid submission posts the envelope once, shows the success copy and fires submit then success', async () => {
  // body equals { submission_id: expect.any(String), email, message, website_url: '' }
  // status text: 'Got it. A confirmation is on its way, and I'll reply from brian@hashbrown.dev.'
});

test('a failed request offers the fallback address and fires fail with error_reason', async () => {
  // alert text: "That didn't send. Try again, or email me at brian@hashbrown.dev."
});
```

Keep the existing counter, honeypot, 254-cap, retry-reuse, edit-dismisses-failure and focus-on-success tests, adapted to two fields.

- [ ] **Step 3: Rewrite the page tests (failing)**

In `page.spec.tsx`:

```ts
test('switch on renders the headline, the lede and the form', () => {
  // h1 'Stuck? Tell me where.'
  // lede "I'm Brian, founder of Hashbrown. I'd love to help you, engineer to engineer."
  // a 'Your email' field is present
});

test('switch off renders only the fallback line, no fields and no second email link', () => {
  // text 'Email me at brian@hashbrown.dev.'; no textbox; exactly one mailto link
});

test('the page is dynamic, titled and described in Brian’s voice', () => {
  // dynamic === 'force-dynamic'; title 'Get unstuck: Hashbrown';
  // description 'Stuck building with Hashbrown? Tell me where.'
});
```

- [ ] **Step 4: Run and confirm failure**

Run: `npx nx test www -- test/unstuck`
Expected: FAIL.

- [ ] **Step 5: Implement the hook**

- Remove the `policyVersion` option, `stale` status and the 409 branch. A 409 falls through to the generic failure path.
- Drop `policy_version` from the posted body and `framework` from `UnstuckFacts`.
- Update the TSDoc.

- [ ] **Step 6: Implement the form**

- Delete `FRAMEWORKS`, `frameworkError` and the framework state, ref and field, plus the disclosure paragraph and the stale branch.
- Labels: `Your email`, `Where are you stuck?`.
- Add `MESSAGE_HINT`. Wire the hint as a `<p id="unstuck-hint">` and pass `'unstuck-hint unstuck-count'` as the textarea's extra `aria-describedby`.
- Give the textarea `onBlur={() => setMessageMessage(messageError(message))}`.
- Error copy comes from the spec table, in `emailError` and `messageError`.
- Footer row: a `Send` button (`Sending…` while pending), then `<p className={styles.alternative}>Rather email? <a href={`mailto:${fallbackAddress}`}>{fallbackAddress}</a></p>`. It sits beside the button and wraps under it below about 420px.
- The sent and failed copy comes from the spec and uses `fallbackAddress`, never a literal.
- Update the component TSDoc: two fields, validation on blur, no disclosure.

- [ ] **Step 7: Implement the page and styles**

In `page.tsx`:
- Drop the `UNSTUCK_FORM_*` imports and the blog panel wrapper. Keep `Header` and `Footer`.
- Render `<main className={pageStyles.page}>`, centred, with the headline and lede from the spec, then a `<div className={pageStyles.card}>` holding either `<UnstuckForm fallbackAddress={UNSTUCK_FALLBACK_ADDRESS} />` or `<p>Email me at <a href="mailto:…">brian@hashbrown.dev</a>.</p>`, built from the constant.
- Set the metadata description to `Stuck building with Hashbrown? Tell me where.`

In `UnstuckPage.module.css`:
- The page has `--vanilla-ivory` as its background, a centred column of 560px max width and 16px side padding on phones.
- The heading uses `--font-heading`, `--chocolate-brown`, a heavy weight and a 40px-or-larger size that steps down on phones; both heading and lede are centred.
- `.card` is a white background with a 16px radius and a soft brown-tinted shadow, matching the home page cards.

In `UnstuckForm.module.css`:
- Remove the `.form` max-width now that the card bounds it.
- Add `.hint`, `.footerRow` (flex, space-between, wraps) and `.alternative` (small, `--gray`).

- [ ] **Step 8: Run tests and check the page in a browser**

Run: `npx nx test www -- test/unstuck && npx nx lint www && npx nx build www`
Expected: PASS.

Then run `npx nx serve www` with `GROWTH_UNSTUCK_FORM_ENABLED=true` and open `/unstuck` at desktop width and at 375px. Check:
- the card is centred,
- there is no horizontal scroll,
- the hint and count sit under the textarea,
- "Rather email?" wraps under Send on the phone width,
- tabbing through the empty form shows both errors,
- with the switch unset, only the fallback line shows.

- [ ] **Step 9: Commit**

```bash
git add www/src/components/unstuck www/src/app/unstuck www/test/unstuck
git commit -m "feat(www): focused first-person Get unstuck page with blur validation"
```

---

### Task 5: Lifecycle cron every 30 minutes

**Files:**
- Modify: `www/vercel.json`
- Test: `www/test/redirects.spec.ts:67`

- [ ] **Step 1: Change the expectation to `{ path: '/_/cron/lifecycle', schedule: '*/30 * * * *' }` and run `npx nx test www -- test/redirects.spec.ts`**

Expected: FAIL (still `*/10`).

- [ ] **Step 2: Set the schedule in `www/vercel.json` to `*/30 * * * *`. Leave inbox-recovery at `*/5`.**

- [ ] **Step 3: Run `npx nx test www -- test/redirects.spec.ts`**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add www/vercel.json www/test/redirects.spec.ts
git commit -m "chore(www): run the lifecycle cron every 30 minutes"
```

---

### Task 6: Privacy page, growth spec and runbook

**Files:**
- Modify: `www/content/privacy.md`
- Modify: `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md`
- Modify: `docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md`

- [ ] **Step 1: Privacy**

Replace the first "Get unstuck" paragraph with exactly:

> When you fill in the [Get unstuck form](/unstuck), we keep your email address and your question. We use this information to answer your question.

Leave the second paragraph as it is.

- [ ] **Step 2: Growth spec**

- **§1 goals (line ~48):** the form enrolls the person in the founder sequence; delete "with a visible disclosure".
- **§8.2 path 1:** "Get unstuck form accepted (§8.4)". Delete the sentence about recording the disclosure string and version.
- **§8.4:** replace the field table with two rows (Email; Where are you stuck?). Delete the disclosure row, the button's `aria-describedby` to it and the 409/policy text. Point to `2026-10-25-unstuck-page-polish-design.md` for layout and copy, and update the success copy to the new line.
- **§8.3 and the diagram (line ~161):** confirm both say `*/30`.
- **Gmail poller:** remove it from the diagram (line ~165), the BCC-for-poller bullet (~370), `gmail_seed_message_id` (~345) and the poller section (~529). In their place, say once that replies arrive through Resend receiving and stop the sequence only on opt-out phrases (#717, #744, #753).

- [ ] **Step 3: Runbook**

- Change line ~182 to `*/30 * * * *`.
- Search for `disclosure`, `policy_version`, `409` and `stale`, and drop or reword each step that relies on them.
- Add a "Migration 0011" entry to the enable log's to-do list: apply by hand after merge, and log the before/after row counts.

- [ ] **Step 4: Check the docs build and search index**

Run: `npx nx test www && npx nx build www`
Expected: PASS. Privacy content tests and the search index must still pass.

- [ ] **Step 5: Commit**

```bash
git add www/content/privacy.md docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md
git commit -m "docs(growth): no stored agreement, 30-minute cron, no Gmail poller"
```

---

### Task 7 (after merge, needs Brian's go): apply migration 0011 to production

- [ ] **Step 1: Read-only before count**

Using the production `DATABASE_URL` from the `hashbrown-lifecycle` Vercel project, never printed, in a `begin read only` transaction, count:
- `contact.form_submission` rows with any of the four keys,
- `form.outreach_approved` rows with `policy_version`.

- [ ] **Step 2: Apply the migration with Brian's go**

Run: `env -u TEST_DATABASE_URL -u B4_DATABASE_URL DATABASE_URL=<prod> npx nx migrate-growth growth`
Expected: `0011` applied.

- [ ] **Step 3: Check and log**

Re-run the count; expected 0 and 0. Confirm `install_runtime.outreach_approved` rows still carry `policy_version`. Record the counts in the runbook's enable log.
