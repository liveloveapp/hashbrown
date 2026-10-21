# Growth Provisioning (PR 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-runnable scripts that create, from Brian's personal access tokens, every vendor resource the growth layer needs (Neon, PostHog, Resend domain and key, the lifecycle Vercel project, and the env vars on the www and lifecycle Vercel projects) and print a checklist with no secret values.

**Architecture:** One dependency-free ESM script per vendor under `tools/growth/scripts/provision/`, each exporting pure `ensure*` functions over an injectable `fetch` (the pattern `tools/vercel/bootstrap.mjs` already uses), plus an orchestrator that runs them in order, generates the shared secrets, writes a private env file, and hands it to the existing Vercel bootstrap. Every step is GET-then-POST so a rerun reports `exists` and changes nothing.

**Tech Stack:** Node 24 ESM `.mjs`, `node:test`, `node:crypto`, `fetch`. No new dependencies. (The design named the files `.mts`; this plan uses `.mjs` to match `tools/vercel` exactly, which keeps one tooling pattern for operator scripts.)

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` (§3 constraints, §12, §13.3, §14 PR 0).

## Global Constraints

- Tokens come only from `--env-file` or the process environment, are never written to any file the script creates except the private env output, and never appear in logs, errors, or the checklist.
- Every mutating call is preceded by a read; a rerun must log `exists` for every resource and make no POST.
- Output checklist lists each resource as `created` | `exists` | `manual`, with the manual steps the spec names: Resend webhook secret, the `brian@hashbrown.dev` mailbox, and the preview `GROWTH_PUBLIC_ACTION_ORIGIN`.
- Resource names: Neon project `hashbrown-growth`, region `aws-us-east-1`, Postgres 17, branches `main` (production) and `preview`, databases `growth` and `b4_state` on each; PostHog project `hashbrown`; Resend domain `hashbrown.dev` region `us-east-1`, API key `hashbrown-lifecycle`; Vercel project `hashbrown-lifecycle`, GitHub secret `VERCEL_PROJECT_ID_LIFECYCLE`.
- Tests use top-level `test(...)` with arrange, act, assert separated by blank lines. Exported functions carry TSDoc.
- Run `npx nx lint growth`, `npx nx test growth`, `npx nx lint vercel-bootstrap`, `npx nx test vercel-bootstrap` before the PR.

## Review Focus

1. A second run against fully provisioned vendors makes zero POST/PATCH calls (Task 6 orchestrator test with all-exists stubs).
2. A vendor 4xx aborts with the method and path in the message and no token substring (Task 1 client test).
3. The Resend API key already exists: the script reports `exists` and does not upsert an empty `RESEND_API_KEY` (Task 4 and Task 5 tests).
4. Preview and production connection strings never cross: `PREVIEW_DATABASE_URL` reaches only the `preview` target (Task 5 test).
5. Resend DNS records already present on the Vercel zone are not duplicated (Task 4 mapping test plus the existing `ensureDnsRecords`).

---

### Task 1: Shared provisioning helpers

**Files:**
- Create: `tools/growth/scripts/provision/lib.mjs`
- Create: `tools/growth/scripts/provision/lib.test.mjs`
- Create: `tools/growth/project.json`

**Interfaces:**
- Produces:
  - `createJsonClient({ baseUrl, token, fetchImpl = fetch, scheme = 'Bearer' })` → `async (method, path, body?) => any`. Non-2xx throws `Error` with `status`, message `"<METHOD> <path> -> <status>: <vendor message or 'response body omitted'>"`.
  - `randomSecret()` → 64-char lowercase hex from `crypto.randomBytes(32)`.
  - `createChecklist()` → `{ add(step, outcome, detail = ''), lines(), print() }`; `outcome` is `'created' | 'exists' | 'updated' | 'skipped' | 'manual'`.
  - `assertNoSecrets(text, secrets: string[])` → throws if any secret longer than 8 chars appears in `text`.
  - `loadEnvFile(path)` → calls `process.loadEnvFile`, warning for keys already set (copy the behaviour from `tools/vercel/bootstrap.mjs` lines 484–494).

- [ ] **Step 1: Write the failing tests**

```js
test('createJsonClient sends the scheme and token and throws on non-2xx without echoing the token', async () => { /* 403 stub; assert error.status === 403, message includes 'GET /x -> 403', message does not include 'tok-secret-value' */ });
test('createJsonClient parses JSON bodies and sends JSON', async () => { /* POST with body; assert content-type and parsed response */ });
test('randomSecret is 64 hex chars and unique', () => {});
test('createChecklist prints padded step, outcome, detail lines', () => {});
test('assertNoSecrets throws when a secret appears in text', () => {});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tools/growth/scripts/provision/lib.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib.mjs`** with the signatures above. Reuse the error shape from `createVercelClient` in `tools/vercel/bootstrap.mjs:88-116`.

- [ ] **Step 4: Add `tools/growth/project.json`** named `growth`, `sourceRoot: tools/growth`, targets `lint` (`eslint tools/growth`) and `test` (`node --test tools/growth/scripts/**/*.test.mjs`), mirroring `tools/vercel/project.json`.

- [ ] **Step 5: Run tests and lint**

Run: `npx nx test growth && npx nx lint growth`
Expected: PASS.

- [ ] **Step 6: Commit** `feat(growth): provisioning helpers`

---

### Task 2: Neon provisioning

**Files:**
- Create: `tools/growth/scripts/provision/neon.mjs`
- Create: `tools/growth/scripts/provision/neon.test.mjs`

**Interfaces:**
- Consumes: `createJsonClient` with `baseUrl: 'https://console.neon.tech/api/v2'`, token from `NEON_API_KEY`.
- Produces:
  - `ensureNeonProject(neon, name)` → `{ status, project: { id } }`. GET `/projects?search=<name>` then POST `/projects` `{ project: { name, region_id: 'aws-us-east-1', pg_version: 17 } }`.
  - `defaultBranchAndRole(neon, projectId)` → `{ branchId, roleName }` from GET `/projects/{id}/branches` (the entry with `default: true`) and GET `/projects/{id}/branches/{bid}/roles` (first non-protected role), so a rerun does not depend on the creation response.
  - `ensureBranch(neon, projectId, name, parentId)` → `{ status, branch: { id } }`. GET `/projects/{id}/branches`, POST `{ branch: { name, parent_id }, endpoints: [{ type: 'read_write' }] }`.
  - `ensureDatabase(neon, projectId, branchId, name, ownerName)` → `status`. GET `/projects/{id}/branches/{bid}/databases`, POST `{ database: { name, owner_name } }`.
  - `connectionUri(neon, projectId, branchId, databaseName, roleName)` → string, GET `/projects/{id}/connection_uri?branch_id&database_name&role_name&pooled=true`.
  - `provisionNeon(neon, checklist)` → `{ DATABASE_URL, B4_DATABASE_URL, PREVIEW_DATABASE_URL, PREVIEW_B4_DATABASE_URL }` for `main` and `preview` branches, databases `growth` and `b4_state`.

- [ ] **Step 1: Write the failing tests** using a `stubFetch(routes)` copied from `tools/vercel/bootstrap.test.mjs:19-41` into a shared `tools/growth/scripts/provision/test-support.mjs`.

```js
test('ensureNeonProject creates the project when the search is empty', ...);  // asserts POST body region_id and pg_version
test('ensureNeonProject reports exists and makes no POST when found', ...);
test('ensureBranch creates preview from the default branch', ...);
test('ensureDatabase is a no-op when the database exists', ...);
test('provisionNeon returns four pooled connection strings keyed as the Vercel env expects', ...);
```

- [ ] **Step 2: Run to verify they fail**. Run: `node --test tools/growth/scripts/provision/neon.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement `neon.mjs`** with the signatures above and a `main()` guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` that reads `NEON_API_KEY`, runs `provisionNeon`, and prints the checklist only.

- [ ] **Step 4: Run tests**. Expected: PASS.

- [ ] **Step 5: Commit** `feat(growth): provision the Neon project`

---

### Task 3: PostHog provisioning

**Files:**
- Create: `tools/growth/scripts/provision/posthog.mjs`
- Create: `tools/growth/scripts/provision/posthog.test.mjs`

**Interfaces:**
- Consumes: `createJsonClient` with `baseUrl: 'https://us.posthog.com'`, token from `POSTHOG_PERSONAL_API_KEY` (scopes `organization:read`, `project:write`).
- Produces:
  - `ensurePosthogProject(posthog, name)` → `{ status, project: { id, api_token } }`. GET `/api/organizations/@current/` for the org id, GET `/api/organizations/{orgId}/projects/`, POST `{ name }`.
  - `provisionPosthog(posthog, checklist)` → `{ NEXT_PUBLIC_POSTHOG_TOKEN, NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_ID }`.

- [ ] **Step 1: Write the failing tests**

```js
test('ensurePosthogProject creates hashbrown under the current organization', ...);
test('ensurePosthogProject reports exists when a project named hashbrown is listed', ...);
test('provisionPosthog returns the project token under NEXT_PUBLIC_POSTHOG_TOKEN', ...);
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL.
- [ ] **Step 3: Implement `posthog.mjs`** with the same `main()` guard as Task 2.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): provision the PostHog project`

---

### Task 4: Resend domain, DNS records, and sending key

**Files:**
- Create: `tools/growth/scripts/provision/resend.mjs`
- Create: `tools/growth/scripts/provision/resend.test.mjs`

**Interfaces:**
- Consumes: `createJsonClient` with `baseUrl: 'https://api.resend.com'`, token from `RESEND_PROVISION_API_KEY` (a full-access key on threadplane's account, used only here). From `tools/vercel/bootstrap.mjs`: `createVercelClient`, `ensureDnsRecords(vercel, DOMAIN, records)`, `DOMAIN`.
- Produces:
  - `ensureResendDomain(resend, name)` → `{ status, domain: { id, status, records } }`. GET `/domains`, POST `{ name, region: 'us-east-1' }`, then GET `/domains/{id}` for records.
  - `toVercelDnsRecords(records)` → `[{ name, type, value, ttl: 3600, mxPriority? }]`. Resend record `name` is relative to the zone and is used as-is; `priority` maps to `mxPriority`; `ttl: 'Auto'` becomes 3600.
  - `ensureSendingKey(resend, name, domainId)` → `{ status: 'created', token }` or `{ status: 'exists' }`. GET `/api-keys` by `name`; POST `{ name, permission: 'sending_access', domain_id }`.
  - `verifyDomain(resend, domainId)` → POST `/domains/{id}/verify`, returns the resulting `status` string.
  - `provisionResend(resend, vercel, checklist)` → `{ RESEND_API_KEY?: string }` (absent when the key already existed) and adds checklist lines for domain, each DNS record (via `ensureDnsRecords` counts), verification status, and the manual webhook step: `manual  create a webhook at https://resend.com/webhooks for https://hashbrown.dev/_/webhooks/resend (events email.sent, delivered, delivery_delayed, bounced, complained, suppressed, failed) and set RESEND_WEBHOOK_SECRET on hashbrown-www and hashbrown-lifecycle`.

- [ ] **Step 1: Write the failing tests**

```js
test('ensureResendDomain creates hashbrown.dev in us-east-1 when absent', ...);
test('ensureResendDomain reports exists when listed', ...);
test('toVercelDnsRecords maps MX priority and Auto ttl', ...);  // input: [{record:'MX',name:'send',type:'MX',value:'feedback-smtp.us-east-1.amazonses.com',priority:10,ttl:'Auto'},{record:'DKIM',name:'resend._domainkey',type:'TXT',value:'p=abc',ttl:'Auto'}]; expected mxPriority 10, ttl 3600, no priority key
test('ensureSendingKey does not create a second key with the same name and returns no token', ...);
test('provisionResend omits RESEND_API_KEY when the key existed', ...);
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL.
- [ ] **Step 3: Implement `resend.mjs`**, importing the Vercel helpers from `../../../vercel/bootstrap.mjs`. `main()` reads `RESEND_PROVISION_API_KEY` and `VERCEL_TOKEN`, resolves `teamId` as `bootstrap.mjs:502-504` does.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(growth): provision the Resend domain and sending key`

---

### Task 5: Vercel bootstrap: lifecycle project and per-target env vars

**Files:**
- Modify: `tools/vercel/bootstrap.mjs` (`TARGETS` at lines 48–79, `upsertEnv` at 199–222, the per-target loop at 520–531, the `OPENAI_API_KEY` guard at 498–500)
- Modify: `tools/vercel/bootstrap.test.mjs`

**Interfaces:**
- Produces:
  - `upsertEnv(vercel, projectId, variables, targets = ['production', 'preview'])`: unchanged behaviour by default; `targets` is passed through to each entry.
  - A new optional target field `envPerTarget: string[]`. For each `KEY` listed, `process.env[KEY]` is upserted to `['production']` and `process.env['PREVIEW_' + KEY]` to `['preview']`; missing values are skipped, never written empty.
  - New `TARGETS` entry:
    ```js
    { key: 'lifecycle', project: 'hashbrown-lifecycle', secret: 'VERCEL_PROJECT_ID_LIFECYCLE', domains: [],
      env: ['LIFECYCLE_SERVICE_SECRET','GROWTH_ACTION_TOKEN_ACTIVE_VERSION','GROWTH_ACTION_TOKEN_ACTIVE_SECRET','GROWTH_EMAIL_HMAC_ACTIVE_VERSION','GROWTH_EMAIL_HMAC_ACTIVE_SECRET','RESEND_API_KEY','RESEND_TRACKING_DISABLED','RESEND_SENDER_VERIFIED','FOUNDER_NOTIFICATION_EMAIL','CAMPAIGN_ENABLED','CAMPAIGN_ENROLLMENT_ENABLED','DELIVERY_ENABLED','LIFECYCLE_CRON_ENABLED','GROWTH_OBSERVATION_PROCESSING_ENABLED','GROWTH_INSTALL_DIGEST_ENABLED','GROWTH_INSTALL_RUNTIME_HELLO_ENABLED'],
      envPerTarget: ['DATABASE_URL','B4_DATABASE_URL','GROWTH_DATABASE_ENVIRONMENT','DELIVERY_ENVIRONMENT','GROWTH_PUBLIC_ACTION_ORIGIN','RESEND_NON_PRODUCTION_ALLOWLIST','RESEND_NON_PRODUCTION_REDIRECT_TO'],
      requiredEnv: ['DATABASE_URL','B4_DATABASE_URL','LIFECYCLE_SERVICE_SECRET','RESEND_API_KEY'],
      resources: { fluid: true, functionDefaultTimeout: 60 } }
    ```
    The `www` target gains `env: [...existing, 'LIFECYCLE_SERVICE_SECRET','CRON_SECRET','GROWTH_ACTION_TOKEN_ACTIVE_VERSION','GROWTH_ACTION_TOKEN_ACTIVE_SECRET','GROWTH_EMAIL_HMAC_ACTIVE_VERSION','GROWTH_EMAIL_HMAC_ACTIVE_SECRET','GOOGLE_REPLY_HMAC_SECRET','NEXT_PUBLIC_POSTHOG_TOKEN','NEXT_PUBLIC_POSTHOG_HOST']` and `envPerTarget: ['DATABASE_URL','GROWTH_DATABASE_ENVIRONMENT','LIFECYCLE_URL']`.
  - The `OPENAI_API_KEY` guard becomes per-target: a target whose `requiredEnv` value is absent from `process.env` is reported `missing` (the existing `missingEnv` path) rather than aborting the run, so the growth env file can be applied without the OpenAI key present.

- [ ] **Step 1: Write the failing tests**

```js
test('upsertEnv writes PREVIEW_ values only to the preview target', ...);  // envPerTarget helper: assert two POST entries, one target ['production'] value 'prod-url', one ['preview'] value 'preview-url'
test('upsertEnv skips a per-target key whose value is unset', ...);
test('TARGETS includes hashbrown-lifecycle with no domains and a 60 second fluid timeout', ...);
test('TARGETS www lists the growth env keys', ...);
```

- [ ] **Step 2: Run to verify failure.** Run: `npx nx test vercel-bootstrap`. Expected: FAIL.
- [ ] **Step 3: Implement**: add `upsertEnvPerTarget(vercel, projectId, keys, env = process.env)` (exported) that builds the two variable maps and calls `upsertEnv` twice; call it in the loop after the existing `upsertEnv`; add the target; relax the guard.
- [ ] **Step 4: Run tests and lint.** Run: `npx nx test vercel-bootstrap && npx nx lint vercel-bootstrap`. Expected: PASS, existing 24 tests still green.
- [ ] **Step 5: Commit** `feat(vercel): lifecycle project and growth env vars`

---

### Task 6: Orchestrator, env output, runbook

**Files:**
- Create: `tools/growth/scripts/provision/index.mjs`
- Create: `tools/growth/scripts/provision/index.test.mjs`
- Modify: `.gitignore` (add `tools/growth/.provision/`)
- Modify: `.env.example` (add commented `NEON_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `RESEND_PROVISION_API_KEY`, `VERCEL_TOKEN`, `FOUNDER_NOTIFICATION_EMAIL`)
- Create: `docs/superpowers/runbooks/2026-10-20-growth-provisioning.md`

**Interfaces:**
- Consumes: `provisionNeon`, `provisionPosthog`, `provisionResend`, `randomSecret`, `createChecklist`, `assertNoSecrets`, `loadEnvFile`.
- Produces:
  - `buildEnvFile({ neon, posthog, resend, secrets, founderEmail })` → string of `KEY=value` lines containing, in addition to the vendor outputs: `LIFECYCLE_SERVICE_SECRET`, `CRON_SECRET`, `GOOGLE_REPLY_HMAC_SECRET`, `GROWTH_ACTION_TOKEN_ACTIVE_SECRET`, `GROWTH_EMAIL_HMAC_ACTIVE_SECRET` (each `randomSecret()`), `GROWTH_ACTION_TOKEN_ACTIVE_VERSION=v1`, `GROWTH_EMAIL_HMAC_ACTIVE_VERSION=v1`, `GROWTH_DATABASE_ENVIRONMENT=production`, `PREVIEW_GROWTH_DATABASE_ENVIRONMENT=preview`, `DELIVERY_ENVIRONMENT=production`, `PREVIEW_DELIVERY_ENVIRONMENT=preview`, `GROWTH_PUBLIC_ACTION_ORIGIN=https://hashbrown.dev`, `LIFECYCLE_URL=https://hashbrown-lifecycle.vercel.app`, `RESEND_TRACKING_DISABLED=true`, `RESEND_SENDER_VERIFIED=false`, `FOUNDER_NOTIFICATION_EMAIL`, and every rollout switch from the spec §14 set to `false`. `PREVIEW_GROWTH_PUBLIC_ACTION_ORIGIN`, `PREVIEW_LIFECYCLE_URL`, and `PREVIEW_RESEND_NON_PRODUCTION_*` are omitted and listed as `manual` in the checklist. Values with `=` or newlines are rejected.
  - `main()`: `--env-file` (tokens), `--out <dir>` (default `tools/growth/.provision`), runs the three vendors, writes `<out>/growth.env` with mode `0600`, then spawns `node tools/vercel/bootstrap.mjs --env-file <out>/growth.env --skip-workflow` (the `OPENAI_*` keys are not in that file, so the www target reports them `missing`, which is expected), then prints the checklist and the manual steps. On a rerun where `RESEND_API_KEY` is absent from the Resend result, it is copied from an existing `<out>/growth.env` if present, else listed `manual`.

- [ ] **Step 1: Write the failing tests**

```js
test('buildEnvFile sets every rollout switch to false and both HMAC versions to v1', ...);
test('buildEnvFile omits RESEND_API_KEY when resend returned none', ...);
test('buildEnvFile rejects a value containing a newline', ...);
test('checklist output contains no secret from the env file', ...);  // assertNoSecrets(checklist.lines().join('\n'), Object.values(parsedEnv))
test('a rerun with all-exists vendors makes no POST', ...);  // stub all three vendor fetches returning existing resources; assert calls.every(c => c.method === 'GET')
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL.
- [ ] **Step 3: Implement `index.mjs`**; use `node:child_process` `spawn` with `stdio: 'inherit'` for the bootstrap step.
- [ ] **Step 4: Write the runbook** with: required token scopes (Neon API key; PostHog personal key with `organization:read` and `project:write`; Resend full-access key; Vercel token), the exact command `node tools/growth/scripts/provision/index.mjs --env-file ~/hashbrown-provision.env`, the three manual steps, "revoke the tokens when done", and "rerun is safe".
- [ ] **Step 5: Run everything.** Run: `npx nx test growth && npx nx lint growth && npx nx test vercel-bootstrap && npx nx lint vercel-bootstrap`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(growth): provisioning orchestrator and runbook`

---

### Task 7: Live run and verification

Not code. Run with Brian's tokens once, on this branch, before the PR is opened.

- [ ] Run `node tools/growth/scripts/provision/index.mjs --env-file <path>`; expected output: every line `created`, three `manual` lines, no `missing` except `OPENAI_*` on www.
- [ ] Run it a second time; expected: every vendor line `exists`, no new resources in any dashboard.
- [ ] In Neon, confirm four databases exist (`growth`, `b4_state` on `main` and `preview`). In PostHog, confirm the `hashbrown` project. In Resend, confirm `hashbrown.dev` shows `verified` (DNS propagation may take minutes; rerun verifies again). In Vercel, confirm `hashbrown-lifecycle` exists with Node 24 and the env vars on both targets.
- [ ] Confirm `gh secret list --repo liveloveapp/hashbrown` shows `VERCEL_PROJECT_ID_LIFECYCLE`.
- [ ] Record the live results in the PR description without any values.
