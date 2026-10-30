# Marketing Automation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brian drafts and approves a week of posts in one Claude Code session (`/hashbrown-week`), and a cloud service publishes every approved post on schedule to his personal X and LinkedIn, hashbrown.dev, and dev.to.

**Architecture:** A post queue in the growth Neon database (`marketing_*` tables). A new b4run app, `tools/marketing`, built and deployed exactly like `tools/lifecycle`, whose `dispatch` workflow leases due approved posts and publishes them through channel adapters ported from threadplane. A `www` cron route calls `dispatch` every 15 minutes. A local CLI (`nx run marketing:week`) and a Claude Code skill drive drafting and review against the same tables.

**Tech Stack:** TypeScript (Node 24), b4run 0.14 (`@b4run/cli`, `@b4run/sdk`), `@neondatabase/serverless` via `tools/growth`'s `createDatabaseExecutor`, zod 4, vitest, Next.js (www), Vercel cron, GitHub REST API, X API v2, LinkedIn Posts API, dev.to API.

**Spec:** `docs/superpowers/specs/2026-10-29-marketing-automation-design.md` (phase 1 only; phases 2 to 4 get their own plans).

## Global Constraints

- Nothing publishes unless its row has `status = 'approved'`. Approval is per post; the week's status is bookkeeping, not a gate.
- Tables use the `marketing_` prefix and live in the growth database (`DATABASE_URL`); migrations go in `tools/growth/migrations/` and run with `nx run growth:migrate-growth`.
- `tools/marketing` mirrors `tools/lifecycle`: b4run 0.14, `b4.config.ts` with `targets: ['vercel']`, `maxDuration: 60`, bearer adapter in front of b4run, b4 state in `B4_DATABASE_URL`, and the growth `DATABASE_URL` never passed to b4run as its env.
- Secrets (names only): `DATABASE_URL`, `B4_DATABASE_URL`, `MARKETING_SERVICE_SECRET`, `CRON_SECRET`, `MARKETING_CRON_ENABLED`, `MARKETING_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_AUTHOR_URN`, `DEVTO_API_KEY`, `MARKETING_GITHUB_TOKEN`, `MARKETING_CREDENTIALS_KEY`, `MARKETING_DRY_RUN`.
- X and LinkedIn tokens live encrypted in `marketing_channel_credentials`, never in env. Rotated X refresh tokens are persisted before the new access token is used.
- Blog PRs are merged with a non-admin token: branch updated from `main` 2 hours before `scheduled_at`, merged at `scheduled_at` only if mergeable, otherwise `failed`. Not live within 24 hours of merge: the blog post and its dependents go to `held`.
- dev.to gets the post only through the API, with `canonical_url` = `https://hashbrown.dev/blog/<slug>`; dev.to RSS import stays off.
- Voice: no em dashes, no hashtags, at most one emoji, banned words and phrases from spec section 5, X 280 chars, LinkedIn 3000 chars, sources required on every post. The check reports; it never rewrites.
- Content is text-only in phase 1; blog posts rely on the site's generated share card.
- Default timezone `America/New_York`; every `scheduledAt` in an import must carry an explicit UTC offset.
- Code comments, naming and test style follow `tools/lifecycle` and `tools/growth`.

## Review Focus

1. **Two cron ticks overlap, or a tick times out mid-publish.** Expected: a post is never published twice. Pinned in Task 4 (`leaseDuePosts` skips leased rows) and Task 8 (a `publishing` row whose lease expired with no `external_id` becomes `failed`, never retried).
2. **Brian edits a post after approving it.** Expected: it drops back to `draft` and needs approval again. Pinned in Task 4 (`updatePostDraft` resets status).
3. **X rotates the refresh token, then the post call fails.** Expected: the new tokens are already saved, so the next tick still authenticates. Pinned in Task 3.
4. **A blog PR is red or conflicted at publish time, or the deploy never goes live.** Expected: nothing downstream (dev.to, promos) publishes, and Brian sees why. Pinned in Task 7 and Task 8.
5. **A scheduled time without an offset, or across a DST change.** Expected: the import is rejected rather than guessed. Pinned in Task 10.

---

### Task 1: Queue tables

**Files:**
- Create: `tools/growth/migrations/0012_marketing_queue.sql`
- Test: `tools/marketing/src/queue/schema.integration.spec.ts` (runs under Task 2's `test-integration` target; write it now, run it after Task 2)

**Interfaces:**
- Produces the tables every later task uses:
  - `marketing_weeks(id uuid pk default gen_random_uuid(), week_start date not null unique, status text not null check in ('draft','approved','done') default 'draft', research_brief jsonb not null default '{}', approved_at timestamptz, created_at, updated_at)`
  - `marketing_posts(id uuid pk, week_id uuid not null references marketing_weeks(id) on delete cascade, channel text check in ('x','linkedin','blog','devto'), kind text check in ('release','qa','topical','guide','take','blog_promo','blog'), scheduled_at timestamptz not null, draft jsonb not null, sources jsonb not null default '[]', depends_on uuid references marketing_posts(id), status text not null default 'draft' check in ('draft','approved','held','publishing','published','failed','cancelled'), attempts smallint not null default 0, next_attempt_at timestamptz, lease_until timestamptz, external_id text, external_url text, published_at timestamptz, last_error text, created_at, updated_at)`
  - index `marketing_posts_due on marketing_posts (scheduled_at) where status in ('approved','publishing')`
  - `marketing_channel_credentials(channel text pk check in ('x','linkedin'), ciphertext text not null, expires_at timestamptz, updated_at timestamptz not null default now())`

- [ ] **Step 1: Write the failing integration test** `schema.integration.spec.ts`: applies migrations to `TEST_DATABASE_URL` with `applyMigrations` from `tools/growth/scripts/apply-migrations.mts`, then asserts: inserting a post with `status = 'bogus'` throws; inserting a post whose `week_id` does not exist throws; deleting a week deletes its posts.
- [ ] **Step 2: Write the migration** `0012_marketing_queue.sql` with the tables above (file name must match `^\d{4,}_[a-z0-9]+(?:[-_][a-z0-9]+)*\.sql$`).
- [ ] **Step 3: Verify the migration runner accepts it**
  Run: `npx nx test growth`
  Expected: PASS (the runner's own specs read the directory).
- [ ] **Step 4: Commit**
  ```bash
  git add tools/growth/migrations/0012_marketing_queue.sql tools/marketing/src/queue/schema.integration.spec.ts
  git commit -m "feat(marketing): queue tables"
  ```

### Task 2: `tools/marketing` b4run app shell

Copy `tools/lifecycle` structure; rename `lifecycle` to `marketing`, `LIFECYCLE_SERVICE_SECRET` to `MARKETING_SERVICE_SECRET`. Leave out lifecycle's campaign, fulfillment, notifications and resend code.

**Files:**
- Create: `tools/marketing/{package.json,project.json,b4.config.ts,tsconfig.json,tsconfig.spec.json,vitest.config.mts,vitest.integration.config.mts,README.md}`
- Create: `tools/marketing/scripts/{b4-cli.mts,verify-vercel-adapter.mts,verify-vercel-adapter.spec.ts}`
- Create: `tools/marketing/src/{vercel-adapter.ts,vercel-adapter.spec.ts,service-auth.ts,service-auth.spec.ts,middleware.ts}`
- Create: `tools/marketing/src/app/dispatch/{index.ts,state.ts,state.spec.ts}`
- Modify: `.github/workflows/pr-main.yml` (`DEPLOY_TARGETS`: add `{"key":"marketing","dir":"tools/marketing","project_id_secret":"VERCEL_PROJECT_ID_MARKETING","optional":true}`)
- Modify: `tools/vercel/bootstrap.mjs` (a `marketing` project like the lifecycle one, with the secrets from Global Constraints)

**Interfaces:**
- Produces `DispatchState` in `src/app/dispatch/state.ts`:
  ```ts
  { trigger: 'cron'; result?: { leased: number; published: number; failed: number; held: number;
    operatorAlerts: Array<'post_failed' | 'blog_not_live' | 'credential_expiring'> } }
  ```
- Produces `workflow(current: DispatchState, context: RuntimeContext): Promise<DispatchState>`; in this task it returns `{ ...current, result: { leased: 0, published: 0, failed: 0, held: 0, operatorAlerts: [] } }`. Task 8 replaces the body.
- `project.json` targets: `lint`, `test`, `test-integration`, `check`, `build` (same commands as lifecycle with paths changed) and `week` (`node --import tsx tools/marketing/scripts/week.mts`, `forwardAllArgs: true`, `cache: false`), used by Task 10.

- [ ] **Step 1: Port the adapter and state specs** from `tools/lifecycle` with renamed variables; they fail because the sources do not exist.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL (modules missing).
- [ ] **Step 3: Create the files listed above** from their lifecycle counterparts.
- [ ] **Step 4: Run** `npx nx test marketing && npx nx build marketing`. Expected: PASS, and `verify-vercel-adapter` reports 401 without a bearer and 503 without `B4_DATABASE_URL` on every path.
- [ ] **Step 5: Run Task 1's integration test** `TEST_DATABASE_URL=… npx nx test-integration marketing`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(marketing): b4run app shell and deploy target`.

### Task 3: Channel adapters with stored credentials

Port `~/repos/angular-agent-framework/marketing/channels/src/{types,http,validation,x,linkedin,devto}` into `tools/marketing/src/channels/`. Changes from threadplane: the `reddit` channel is removed; tokens come from a `CredentialStore`, not env; tests inject `fetch` (`vi.fn`) instead of msw, which hashbrown does not depend on; dry run returns a fake result instead of writing a file.

**Files:**
- Create: `tools/marketing/src/channels/{types.ts,http.ts,validation.ts,validation.spec.ts,registry.ts,registry.spec.ts}`
- Create: `tools/marketing/src/channels/x/{auth.ts,auth.spec.ts,post.ts,post.spec.ts,auth-cli.mts}`
- Create: `tools/marketing/src/channels/linkedin/{auth.ts,auth.spec.ts,post.ts,post.spec.ts,little.ts,little.spec.ts,auth-cli.mts}`
- Create: `tools/marketing/src/channels/devto/{post.ts,post.spec.ts}`
- Create: `tools/marketing/src/credentials/{store.ts,store.spec.ts,crypto.ts,crypto.spec.ts}`
- Modify: `tools/marketing/project.json` (targets `x-auth` and `linkedin-auth`, `node --import tsx` on each `auth-cli.mts`, `cache: false`)

**Interfaces:**
- Consumes: `SqlExecutor` from `tools/growth/src/lib/database.ts`.
- Produces:
  ```ts
  // channels/types.ts: threadplane's Draft, PostResult, ChannelAdapter, with
  type SocialChannel = 'x' | 'linkedin' | 'devto';
  // credentials/store.ts
  interface ChannelCredentials { accessToken: string; refreshToken?: string; expiresAt?: string }
  interface CredentialStore {
    get(channel: 'x' | 'linkedin'): Promise<ChannelCredentials | undefined>;
    put(channel: 'x' | 'linkedin', credentials: ChannelCredentials): Promise<void>;
    expiringWithin(now: Date, days: number): Promise<Array<{ channel: 'x' | 'linkedin'; expiresAt: string }>>;
  }
  function createCredentialStore(executor: SqlExecutor, key: string): CredentialStore;
  // credentials/crypto.ts: AES-256-GCM, key is base64 of 32 bytes
  function encryptCredentials(value: ChannelCredentials, key: string): string;
  function decryptCredentials(ciphertext: string, key: string): ChannelCredentials;
  // channels/registry.ts
  interface AdapterOptions { credentials: CredentialStore; env: Readonly<Record<string, string | undefined>>; fetch?: typeof fetch; dryRun: boolean }
  function createAdapters(options: AdapterOptions): Record<SocialChannel, ChannelAdapter>;
  ```
- The auth CLIs (`nx run marketing:x-auth`, `nx run marketing:linkedin-auth`; add both targets to `project.json`) run the threadplane OAuth flows and `put` the tokens; LinkedIn's `expiresAt` is now plus `expires_in`.

- [ ] **Step 1: Write the failing tests:**
  - `crypto.spec.ts`: round-trips; `decryptCredentials` with a different key throws; a key that is not 32 bytes throws.
  - `x/auth.spec.ts` `persists rotated tokens before returning`: fetch answers the token endpoint with new tokens and the store's `put` is asserted called with them before `refresh()` resolves; a second test where `put` rejects makes `refresh()` reject.
  - `x/post.spec.ts`: a 401 triggers one refresh and one retry; a draft over 280 chars is rejected before any fetch call.
  - `linkedin/post.spec.ts`: `firstComment` posts a comment after the post; parentheses in text are escaped (port threadplane's case).
  - `devto/post.spec.ts`: sends `published: true`, `canonical_url`, at most 4 tags.
  - `registry.spec.ts`: with `dryRun: true`, `post()` makes no fetch call and returns `{ postId: 'dry-run-…', url: 'dry-run://<channel>/…' }`.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL.
- [ ] **Step 3: Port and adapt** the threadplane sources per the interfaces above.
- [ ] **Step 4: Run** `npx nx test marketing`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): channel adapters with encrypted stored credentials`.

### Task 4: Queue repository

**Files:**
- Create: `tools/marketing/src/queue/{types.ts,repository.ts,repository.integration.spec.ts}`
- Create: `tools/marketing/src/queue/schema.ts`, `schema.spec.ts` (the `WeekImport` schema; its definition and tests are listed under Task 10, but they are written here because `importWeek` needs the type)

**Interfaces:**
- Consumes: `SqlExecutor`.
- Produces:
  ```ts
  type MarketingChannel = 'x' | 'linkedin' | 'blog' | 'devto';
  type PostKind = 'release' | 'qa' | 'topical' | 'guide' | 'take' | 'blog_promo' | 'blog';
  type PostStatus = 'draft' | 'approved' | 'held' | 'publishing' | 'published' | 'failed' | 'cancelled';
  interface Source { url: string; note: string }
  interface BlogDraft { channel: 'blog'; slug: string; title: string; prNumber?: number; branchUpdatedAt?: string; mergedAt?: string }
  interface DevtoDraft { channel: 'devto'; blogSlug: string; article: { title: string; tags: string[]; description: string } }
  type QueueDraft = Draft | BlogDraft | DevtoDraft;   // Draft from channels/types.ts for x and linkedin
  interface QueuedPost { id: string; weekId: string; channel: MarketingChannel; kind: PostKind; scheduledAt: Date;
    draft: QueueDraft; sources: Source[]; dependsOn: string | null; status: PostStatus; attempts: number;
    externalId: string | null; externalUrl: string | null; publishedAt: Date | null; lastError: string | null }

  // repository.ts
  const BLOG_PREP_WINDOW_MS = 2 * 60 * 60 * 1000;
  const LEASE_MS = 5 * 60 * 1000;
  const MAX_ATTEMPTS = 3;
  function leaseDuePosts(executor: SqlExecutor, now: Date, limit: number): Promise<QueuedPost[]>;
  function markPublishing(executor: SqlExecutor, id: string): Promise<void>;
  function markPublished(executor: SqlExecutor, id: string, result: { externalId: string; externalUrl: string; publishedAt: Date }): Promise<void>;
  function markRetry(executor: SqlExecutor, id: string, error: string, now: Date): Promise<'retry' | 'failed'>;
  function markFailed(executor: SqlExecutor, id: string, error: string): Promise<void>;
  function holdWithDependents(executor: SqlExecutor, id: string, reason: string): Promise<string[]>;
  function updateBlogDraft(executor: SqlExecutor, id: string, patch: Partial<BlogDraft>): Promise<void>;
  function updatePostDraft(executor: SqlExecutor, id: string, patch: { draft?: QueueDraft; scheduledAt?: Date; kind?: PostKind; sources?: Source[] }): Promise<void>;
  function approvePosts(executor: SqlExecutor, weekId: string, postId?: string): Promise<number>;
  function setPostStatus(executor: SqlExecutor, id: string, status: 'held' | 'cancelled'): Promise<void>;
  function importWeek(executor: SqlExecutor, week: WeekImport): Promise<{ weekId: string; postIds: Record<string, string> }>;
  function readWeek(executor: SqlExecutor, weekStart: string): Promise<{ week: …; posts: QueuedPost[] } | undefined>;
  ```
  `WeekImport` comes from `schema.ts`, written in this task as specified in Task 10.
- Lease rule (one `update … where id in (select … for update skip locked) returning *`): `status = 'approved'`, `lease_until` null or past, `next_attempt_at` null or past, `depends_on` null or that post `published`, and `scheduled_at <= now`, or for `channel = 'blog'`, `scheduled_at - interval '2 hours' <= now`. Also leases `status = 'publishing'` rows whose lease expired (Task 8 fails these). Sets `lease_until = now + LEASE_MS`.
- `markRetry`: increments `attempts`; under `MAX_ATTEMPTS` sets `next_attempt_at = now + 2^attempts minutes`, status `approved`, returns `'retry'`; otherwise status `failed`, returns `'failed'`.
- `updatePostDraft` refuses (throws) on `published`, `publishing` or `cancelled` rows and sets an `approved` row back to `draft`.
- `importWeek` replaces only `draft` posts of an existing week and refuses when the week has any post past `draft`.
- `approvePosts` approves `draft` posts only (not `held`, not `cancelled`); without `postId` it also sets the week `approved` and `approved_at`.

- [ ] **Step 1: Write the failing integration tests:**
  - `does not lease a draft post`, `does not lease a post before its time`, `leases a blog post 2 hours early`.
  - `two concurrent leases never return the same post` (two `leaseDuePosts` in parallel on 3 due rows; union has no duplicates).
  - `does not lease a dependent until its dependency is published`.
  - `editing an approved post sets it back to draft`; `editing a published post throws`.
  - `markRetry fails the post on the third attempt`.
  - `holdWithDependents holds the post and every post depending on it` (returns their ids).
  - `approve without postId skips held posts and approves the week`.
- [ ] **Step 2: Run** `TEST_DATABASE_URL=… npx nx test-integration marketing`. Expected: FAIL.
- [ ] **Step 3: Implement** `repository.ts` and `types.ts`.
- [ ] **Step 4: Run the integration tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): post queue repository with leasing`.

### Task 5: Voice guide and voice check

**Files:**
- Create: `docs/marketing/voice.md` (from `~/repos/angular-agent-framework/docs/gtm/voice.md`, threadplane notes removed, plus spec section 5 in full, plus 10 to 20 verbatim excerpts from `~/repos/brianflove/src/content/posts/` dated 2024 or earlier, each with its file name)
- Create: `tools/marketing/src/voice/{check.ts,check.spec.ts,banned.ts}`

**Interfaces:**
- Consumes: `QueueDraft`, `PostKind`, `Source` (Task 4); `validateDraft` from `channels/validation.ts` (Task 3).
- Produces:
  ```ts
  interface VoiceIssue { rule: 'em_dash' | 'hashtag' | 'emoji' | 'banned_phrase' | 'length' | 'link' | 'no_sources'; message: string }
  function checkVoice(post: { channel: MarketingChannel; kind: PostKind; draft: QueueDraft; sources: Source[]; body?: string }): VoiceIssue[];
  ```
  `body` is the blog markdown, checked for `em_dash` and `banned_phrase` only. `banned.ts` exports `BANNED_PHRASES` with every word and phrase in spec section 5 "Never" (case-insensitive, word-boundary matched). `link` rule: an `x` post may hold at most one URL; a `linkedin` post's `text` holds no URL (links go in `firstComment`).

- [ ] **Step 1: Write the failing tests** in `check.spec.ts`, one per rule, plus `a clean post in Brian's voice has no issues` using a real-looking X post such as `spent the morning wiring decisions into the atc demo. pretty happy with how small the diff ended up` with one source.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL.
- [ ] **Step 3: Implement** `check.ts` and `banned.ts`; write `docs/marketing/voice.md`.
- [ ] **Step 4: Run** `npx nx test marketing`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): voice guide and voice check`.

### Task 6: dev.to markdown conversion

**Files:**
- Create: `tools/marketing/src/blog/devto-markdown.ts`, `devto-markdown.spec.ts`

**Interfaces:**
- Produces: `function toDevtoMarkdown(markdown: string, postUrl: string): string`. Strips frontmatter; makes root-relative links and images absolute against `https://hashbrown.dev`; makes page-relative ones absolute against `postUrl`; leaves code fences untouched.

- [ ] **Step 1: Write the failing tests:** frontmatter removed; `[docs](/docs/react)` becomes `https://hashbrown.dev/docs/react`; `![x](/blog/image/a.png)` becomes absolute; a `/docs` string inside a fenced code block is unchanged; absolute links unchanged. Before writing assertions for site-only syntax, grep `www/content/blog/*.md` for any non-standard markdown (custom components or directives) and add one test per construct found, converting it to plain markdown.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL.
- [ ] **Step 3: Implement** `toDevtoMarkdown`.
- [ ] **Step 4: Run** `npx nx test marketing`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): dev.to markdown conversion`.

### Task 7: Blog publisher

**Files:**
- Create: `tools/marketing/src/blog/{github.ts,github.spec.ts,publisher.ts,publisher.spec.ts}`

**Interfaces:**
- Produces:
  ```ts
  // github.ts, REST calls on liveloveapp/hashbrown with MARKETING_GITHUB_TOKEN
  interface GitHubClient {
    updateBranch(prNumber: number): Promise<void>;                 // PUT /pulls/{n}/update-branch
    pullState(prNumber: number): Promise<{ merged: boolean; mergeable: boolean | null; mergeableState: string }>;
    merge(prNumber: number): Promise<void>;                        // PUT /pulls/{n}/merge, merge_method 'squash'
    readFile(path: string, ref: 'main'): Promise<string>;          // contents API, decoded
  }
  function createGitHubClient(token: string, fetchImpl?: typeof fetch): GitHubClient;
  // publisher.ts
  const LIVE_DEADLINE_MS = 24 * 60 * 60 * 1000;
  type BlogStep =
    | { kind: 'wait' }
    | { kind: 'branch_updated'; at: Date }
    | { kind: 'merged'; at: Date }
    | { kind: 'published'; url: string; at: Date }
    | { kind: 'failed'; reason: string }
    | { kind: 'not_live'; reason: string };
  function advanceBlogPost(post: QueuedPost & { draft: BlogDraft }, now: Date,
    deps: { github: GitHubClient; isLive: (url: string) => Promise<boolean> }): Promise<BlogStep>;
  function blogUrl(slug: string): string;   // `https://hashbrown.dev/blog/${slug}`
  ```
- `advanceBlogPost` order: no `prNumber` → `failed` ("no blog PR"); before `scheduledAt` without `branchUpdatedAt` → `updateBranch`, `branch_updated`; before `scheduledAt` with it → `wait`; at or after `scheduledAt`, not merged: `mergeable === null` → `wait` (GitHub still computing), `mergeable === false` or `mergeableState` not `clean` → `failed` with the state, otherwise `merge`, `merged`; merged: `isLive(blogUrl)` true → `published`; false and `now - mergedAt > LIVE_DEADLINE_MS` → `not_live`; else `wait`. A PR already merged by hand counts as merged.

- [ ] **Step 1: Write the failing tests** in `publisher.spec.ts`, one per branch above, with a fake `GitHubClient`; `github.spec.ts` asserts method, URL and auth header for each call with an injected fetch.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL.
- [ ] **Step 3: Implement** `github.ts` and `publisher.ts`.
- [ ] **Step 4: Run** `npx nx test marketing`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): blog publisher merges approved blog PRs on schedule`.

### Task 8: Dispatcher and `dispatch` workflow

**Files:**
- Create: `tools/marketing/src/dispatcher.ts`, `dispatcher.spec.ts`, `dispatcher.integration.spec.ts`
- Modify: `tools/marketing/src/app/dispatch/index.ts` (replace Task 2's stub body), `index.spec.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7.
- Produces:
  ```ts
  interface DispatchDependencies {
    executor: SqlExecutor; adapters: Record<SocialChannel, ChannelAdapter>; credentials: CredentialStore;
    github: GitHubClient; isLive: (url: string) => Promise<boolean>; now: () => Date;
  }
  interface DispatchResult { leased: number; published: number; failed: number; held: number;
    operatorAlerts: Array<'post_failed' | 'blog_not_live' | 'credential_expiring'> }
  const DISPATCH_BATCH_SIZE = 5;
  function dispatchMarketing(deps: DispatchDependencies, signal?: AbortSignal): Promise<DispatchResult>;
  function createDispatchDependencies(env: Readonly<Record<string, string | undefined>>): DispatchDependencies;
  ```
- Per leased post:
  - `status = 'publishing'` (lease expired mid-publish): `markFailed` with "publish outcome unknown, check the channel before retrying". Never re-post.
  - `blog`: `advanceBlogPost`; `branch_updated` and `merged` write the timestamp with `updateBlogDraft`; `published` calls `markPublished` with `externalUrl = blogUrl(slug)`; `failed` calls `markFailed`, then `holdWithDependents` on its dependents, and adds `post_failed`; `not_live` calls `holdWithDependents` and adds `blog_not_live`.
  - `devto`: reads `www/content/blog/<blogSlug>.md` from `main` through `github.readFile`, converts with `toDevtoMarkdown`, posts with `canonicalUrl = blogUrl(blogSlug)`.
  - `x` and `linkedin`: post the stored `Draft`.
  - Social and devto posts: `markPublishing` first, then the adapter call, then `markPublished`. An adapter error calls `markRetry`; `'failed'` adds `post_failed`.
- After the batch, `credentials.expiringWithin(now, 14)` non-empty adds `credential_expiring`. Alerts are de-duplicated.
- `isLive(url)` is a `HEAD` that is true only for status 200.
- `createDispatchDependencies` reads `DATABASE_URL` (growth), `MARKETING_CREDENTIALS_KEY`, `MARKETING_GITHUB_TOKEN`, `MARKETING_DRY_RUN === '1'` for `dryRun`, and throws naming any missing variable.

- [ ] **Step 1: Write the failing unit tests** in `dispatcher.spec.ts` with fakes:
  - `a post left in publishing after its lease is failed and not re-posted` (adapter `post` never called).
  - `an adapter error schedules a retry`; `the third adapter error fails the post and raises post_failed`.
  - `a blog post that is not live after 24 hours holds its dependents and raises blog_not_live`.
  - `a blog PR that is not mergeable at publish time fails the post and holds its dependents`.
  - `devto posts the converted blog body with the canonical url`.
  - `an expiring LinkedIn credential raises credential_expiring once`.
- [ ] **Step 2: Write the failing integration test** `dispatcher.integration.spec.ts`: one approved week with an X post, a blog post (PR 1) and a dependent dev.to post, fake GitHub and dry-run adapters; run `dispatchMarketing` at `scheduledAt - 2h`, `scheduledAt`, and `scheduledAt + 15m` with `isLive` true; assert all three rows end `published` and the dev.to publish happened after the blog's.
- [ ] **Step 3: Run** `npx nx test marketing` and the integration target. Expected: FAIL.
- [ ] **Step 4: Implement** `dispatcher.ts`; wire `workflow` to `dispatchMarketing(createDispatchDependencies(process.env), context.signal)`.
- [ ] **Step 5: Run both suites and** `npx nx build marketing`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(marketing): dispatch publishes due approved posts`.

### Task 9: Cron route in www

**Files:**
- Create: `www/src/lib/marketing/marketing-client.ts`
- Create: `www/src/app/%5F/cron/marketing/{handler.ts,route.ts}`
- Create: `www/test/growth/cron-marketing.spec.ts`
- Modify: `www/vercel.json` (add `{ "path": "/_/cron/marketing", "schedule": "*/15 * * * *" }`)
- Modify: `tools/vercel/bootstrap.mjs` (`MARKETING_CRON_ENABLED` and `MARKETING_URL` on the www project, like their lifecycle twins)

**Interfaces:**
- Mirrors `www/src/lib/growth/lifecycle-client.ts` and `www/src/app/%5F/cron/lifecycle/handler.ts` with `trigger: 'cron'` only, its own fixed thread id (a new UUID v4 constant `MARKETING_THREAD_ID`), and alerts `'post_failed' | 'blog_not_live' | 'credential_expiring'` logged as `[marketing-operator-alert] <alert>`.
- Produces `createMarketingCronRoute(dependencies?): (request: Request) => Promise<Response>`; `GET` exported from `route.ts` with `dynamic = 'force-dynamic'`, `maxDuration = 60`.

- [ ] **Step 1: Port** `www/test/growth/cron-lifecycle.spec.ts` to `cron-marketing.spec.ts` with renamed env vars and alerts: 401 without `CRON_SECRET` bearer; 503 when `MARKETING_CRON_ENABLED` is not `'true'`; 503 without `MARKETING_URL` or `MARKETING_SERVICE_SECRET`; 200 with alerts logged on success.
- [ ] **Step 2: Run** `npx nx test www`. Expected: FAIL.
- [ ] **Step 3: Implement** the client, handler and route; update `vercel.json` and bootstrap.
- [ ] **Step 4: Run** `npx nx test www`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): marketing cron route`.

### Task 10: Week CLI

**Files:**
- Create: `tools/marketing/scripts/week.mts`, `week.spec.ts`
- Already created in Task 4: `tools/marketing/src/queue/schema.ts`, `schema.spec.ts` (specified below)

**Interfaces:**
- Consumes: Task 4 repository, Task 5 `checkVoice`, Task 3 `createCredentialStore`.
- Produces `schema.ts`:
  ```ts
  const WeekImport = z.object({
    weekStart: z.iso.date(),   // must be a Monday
    researchBrief: z.record(z.string(), z.unknown()),
    posts: z.array(z.object({
      key: z.string(), channel: z.enum(['x','linkedin','blog','devto']),
      kind: z.enum(['release','qa','topical','guide','take','blog_promo','blog']),
      scheduledAt: z.iso.datetime({ offset: true }),   // offset required
      draft: z.unknown(), sources: z.array(z.object({ url: z.url(), note: z.string() })),
      dependsOnKey: z.string().optional(),
    })),
  });
  type WeekImport = z.infer<typeof WeekImport>;
  ```
  with refinements: `weekStart` is a Monday; every `scheduledAt` falls inside that week in `America/New_York`; every `dependsOnKey` names another post's `key`; `draft` matches the channel's draft shape.
- CLI, run as `npx nx run marketing:week -- <command>`, JSON on stdout, non-zero exit on error:
  - `show [--week YYYY-MM-DD]` (default: the coming Monday) → week and posts with `voiceIssues` per post
  - `import --file <path>` → `importWeek`; prints ids and voice issues
  - `edit --post <id> --file <patch.json>` → `updatePostDraft`; prints the post and its voice issues
  - `check --file <path>` → voice issues for a week file without writing
  - `approve [--post <id>] [--week YYYY-MM-DD]` → `approvePosts`
  - `hold --post <id>` and `cancel --post <id>`
  - `set-pr --post <id> --pr <number>` → `updateBlogDraft`
  - `status` → last week's posts by status, `failed` and `held` posts with `lastError`, credentials expiring within 14 days

- [ ] **Step 1: Write the failing tests:**
  - `schema.spec.ts`: rejects `scheduledAt` without an offset; rejects a Tuesday `weekStart`; rejects a post scheduled the following week; accepts a post on Sunday 23:00 at `-05:00` after the November DST change; rejects an unknown `dependsOnKey`.
  - `week.spec.ts` (with a fake repository): `approve` without `--post` approves the week; `edit` prints voice issues for an em dash.
- [ ] **Step 2: Run** `npx nx test marketing`. Expected: FAIL.
- [ ] **Step 3: Implement** `week.mts` (and any schema refinement Task 4 left out).
- [ ] **Step 4: Run** `npx nx test marketing`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(marketing): week CLI for drafting and review`.

### Task 11: RSS feed

**Files:**
- Create: `www/src/app/blog/rss.xml/route.ts`
- Create: `www/test/blog/rss.spec.ts`
- Modify: `www/src/app/layout.tsx` (`alternates.types['application/rss+xml'] = '/blog/rss.xml'`)

**Interfaces:**
- Consumes: `listBlogPosts()` from `www/src/lib/content.ts`, `SITE_URL` from `www/src/lib/site-metadata.ts`.
- Produces `GET /blog/rss.xml`: RSS 2.0, `content-type: application/rss+xml; charset=utf-8`, one `<item>` per post (title, `link` and `guid` = `${SITE_URL}/blog/${slug}`, `pubDate` from `date`, `description`), newest first, `export const dynamic = 'force-static'`.

- [ ] **Step 1: Write the failing test:** the feed parses as XML, has as many items as `listBlogPosts()`, the first item is the newest post, and `&` in a title is escaped.
- [ ] **Step 2: Run** `npx nx test www`. Expected: FAIL.
- [ ] **Step 3: Implement** the route and the layout link.
- [ ] **Step 4: Run** `npx nx test www`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): blog RSS feed`.

### Task 12: `/hashbrown-week` skill and runbook

**Files:**
- Create: `.claude/skills/hashbrown-week/SKILL.md`
- Create: `docs/marketing/runbook.md`

**Interfaces:**
- Consumes: the Task 10 CLI and `docs/marketing/voice.md`.
- The skill, in order:
  1. Run `week status` and report failures, holds and expiring credentials first.
  2. Research the coming week: `gh release list`, `gh pr list --state merged --search "merged:>=<last Monday>"`, `git log`, `CHANGELOG.md`, `npm view @hashbrownai/core time --json`, the newest files in `www/content/blog/`, `gh issue list` and discussions for Q&A, and web search for topical items. Record every fact's URL as a source.
  3. Read `docs/marketing/voice.md` and last week's published posts (`week show --week <last Monday>`), and avoid repeating topics.
  4. Draft: X daily (weekdays about 10:00, weekends about 11:00), LinkedIn Tuesday and Thursday 08:30 (optional Wednesday), blog Wednesday 10:00 with its dev.to post and same-day promos depending on it; mix per spec 4.5; rules from spec sections 1 and 2 (no politics or offence, no invented facts or first-person stories, honest agent-written Q&A questions). Write the blog file to `www/content/blog/<YYYY-MM-DD>-<slug>.md` dated the publish day, and the week JSON to the session scratchpad.
  5. `week check`, fix every issue, then `week import`.
  6. Present day by day: day, time, channel, kind, full text, sources; the blog post in full. Edit with `week edit` as Brian asks; re-show changed posts.
  7. On "go ahead": commit the blog file on branch `blog/<slug>`, `gh pr create`, `week set-pr`, then `week approve`. Report the schedule. Single-post approval: `week approve --post <id>`.
  8. Never approve without Brian's explicit go-ahead in the conversation.
- `runbook.md`: provisioning the Vercel project (`tools/vercel/bootstrap.mjs`), setting secrets, generating `MARKETING_CREDENTIALS_KEY` (`openssl rand -base64 32`), running migrations, `nx run marketing:x-auth` and `marketing:linkedin-auth` (and re-running the LinkedIn one every 60 days), turning on `MARKETING_DRY_RUN=1` for the first week, then setting `MARKETING_CRON_ENABLED=true`.

- [ ] **Step 1: Write** `SKILL.md` (frontmatter `name: hashbrown-week`, a description that triggers on weekly content planning for hashbrown) and `runbook.md`.
- [ ] **Step 2: Verify** with a dry run against a preview or test database: run the skill, import a week, approve one X post scheduled 5 minutes out, run `npx nx run marketing:week -- status` after the next cron tick (or invoke dispatch directly), and confirm the post is `published` with a `dry-run://` URL.
- [ ] **Step 3: Commit** `feat(marketing): hashbrown-week review skill and runbook`.

### Task 13: First live week (manual acceptance)

- [ ] Brian runs `/hashbrown-week` for a real week with `MARKETING_DRY_RUN` unset.
- [ ] Done when every approved post of that week shows `published` in `week status`, the blog post is live on hashbrown.dev, and the dev.to article shows the hashbrown.dev canonical URL.
