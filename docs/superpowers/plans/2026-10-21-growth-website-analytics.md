# Growth Website Analytics (PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Engagement measurement for hashbrown.dev: posthog-js through a first-party proxy, a closed set of `marketing:*` and `docs:*` events wired into the real surfaces, the website collector that feeds PR 2's observation route, Edge detection of AI crawler and referral traffic, and PostHog dashboards as code with a daily contract check. After this PR Brian can see pageviews, engaged time, docs reading by framework, and every threadplane hand-off click, and Neon receives website sessions and content views.

**Architecture:** Copied and adapted from threadplane: `apps/website/instrumentation-client.ts`, the `/ingest` rewrites in `next.config.ts`, `src/lib/analytics/*`, `src/middleware.ts`, `src/lib/growth/website-collector.ts` + `website-metadata.ts`, and `tools/posthog/*` (reference checkout `/Users/blove/repos/angular-agent-framework`). Hashbrown differences: the proxy lives at `/_/ingest/*` (the site's `/_/` convention); the event vocabulary is the design's (§6.4) plus `marketing:threadplane_cta_click`; there is no SDK-event PostHog route (hashbrown's runtime milestones go to Neon through PR 2, so the `runtime-milestones` dashboard in §9 is the Neon funnel report, not a PostHog dashboard); the PostHog tooling uses `fetch` and a loose path type instead of `openapi-fetch` and the 107k-line generated schema.

**Tech Stack:** `posthog-js` (one new root dependency; confirm with Brian before `npm install`), Next.js 16 rewrites/headers/middleware, Vitest for www and for the new `posthog` Nx project (`tools/posthog`), `tsx` for the operator scripts, zod 4 (already present) for env and dashboard schemas. No `posthog-node`, no `openapi-fetch`.

**Spec:** `docs/superpowers/specs/2026-10-20-growth-lifecycle-design.md` §6.1 (namespaces, forbidden properties), §6.4, §9, §10, §14 item 4.

## Global Constraints

- PostHog is engagement only; nothing in PostHog authorizes a send (§5.2). PostHog never receives raw contact PII: no email, no Git identity, no connection string, no prompt or message content. The contract's forbidden properties are `prompt`, `messages`, `threadId`, `runId`, `apiUrl`, `url`, `error`, `schema`, `toolArgs`, `componentProps`.
- Event names: `namespace:snake_case`; properties snake_case. The closed set shipped by this PR: `$pageview`, `$pageleave`, `marketing:cta_click` (`cta_id`, `surface`, optional `destination_url`, `source_section`), `marketing:threadplane_cta_click` (`surface` ∈ `homepage_banner | footer | docs_platforms | blog | email`, `destination_url`), `marketing:engaged_time` (`engaged_seconds` ∈ 10 | 30), `marketing:ai_crawler_visit` (`ai_crawler`, `source_page`, `user_agent`), `marketing:ai_referral_visit` (`ai_source`, `source_page`), `marketing:pre_analytics_exit`, `docs:page_viewed` (`pathname`, `framework` ∈ `react | angular`), `docs:code_copied` (`pathname`, `framework`, `language`). The `marketing:unstuck_form_*` events are declared in the contract and taxonomy but fired only in PR 6.
- posthog-js init options exactly: `api_host: '/_/ingest'`, `ui_host: 'https://us.posthog.com'`, `defaults: '2026-01-30'`, `capture_pageview: 'history_change'`, `capture_pageleave: 'if_capture_pageview'`, `autocapture: true`, `capture_performance: { web_vitals: true }`, `person_profiles: 'always'`, `disable_surveys: true`. Token from `NEXT_PUBLIC_POSTHOG_TOKEN`; init only when a token exists and (the host is not local or `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL === 'true'`).
- Rewrites, in order: `/_/ingest/static/:path*` → `https://us-assets.i.posthog.com/static/:path*`, `/_/ingest/:path*` → `https://us.i.posthog.com/:path*`; `skipTrailingSlashRedirect: true`; CORS headers on `/_/ingest/:path*` (`*`, `POST, OPTIONS`, `Content-Type, Authorization`, max-age 86400). The existing `/_/chat`, `/_/search-index`, `/_/growth/*`, `/_/unsubscribe`, `/_/webhooks/*` routes must keep working (rewrites apply after filesystem routes; assert this in the config test).
- Engaged time: thresholds 10 s and 30 s of visible time, each fired once per pathname, no viewport gate.
- The website collector posts to `/_/growth/collect/v1/website` only when `NEXT_PUBLIC_GROWTH_COLLECTION === 'true'`; one `website.session_started` per 30-minute inactivity session with `campaignSource/Medium/Name` from `utm_*` (lowercased, `^[a-z0-9][a-z0-9_-]{0,119}$`) and `referrerHost`; one `website.content_viewed` per pathname per session with `contentId` = pathname without the leading slash (`home` for `/`) and `topic` from the same path rules PR 2's catalog uses (`/docs/<sdk>/start` → getting_started, `/concept` → concepts, `/platform` → platform, other `/docs/react` → react, `/docs/angular` → angular, `/api` → reference, `/blog` → blog, `/` and `/docs` → getting_started, else other). Batches ≤ 20 events, `eventId` and `subject.id` UUID v4, subject namespace `website_session`, scope `persistent` (localStorage) with `session`/`memory` fallback. Silently drops on any non-2xx; never retries more than twice; never blocks rendering.
- Middleware: Edge runtime, matcher excludes `/_` paths, `/api`, `_next`, files with an extension, and image routes; raw `fetch` to `https://us.i.posthog.com/i/v0/e/` with a 2 s timeout and `event.waitUntil`; `$process_person_profile: false`, `$ip: null`, `$lib: 'hashbrown-website-middleware'`; crawler dedupe per crawler+path+hour (≤ 2000 keys) and a 500/hour token bucket; same gate as the client (token present; local hosts only with capture-local).
- `tools/posthog` (Nx project `posthog`): env `POSTHOG_PERSONAL_API_KEY` (≥ 20 chars), `POSTHOG_HOST` (default `https://us.i.posthog.com`), `POSTHOG_PROJECT_ID` (positive integer; the live project is id 677870); `sync:plan` never writes; `sync:apply` never deletes without `--delete-orphans`; `report` marks funnels, unique counts, non-`total` math, breakdowns with "Other" hidden (`breakdown_hide_other_aggregation`) and stale data `Unavailable`, never zero; a breakdown whose series all use `math: total` is summed per day across breakdown values (PostHog includes "Other" and null buckets, so the sum is exact) with a "Top values" cell; `quality:live` exits 1 on any required-property or forbidden-property finding and, with `--require-critical-coverage`, when `$pageview` or `marketing:engaged_time` has zero events in the window.
- Tests use top-level `test(...)` with arrange, act, assert separated by blank lines; TSDoc on every export; no secret in any log, committed file, or test fixture. Before the PR: `npx nx test www && npx nx lint www && npx nx build www && npx nx test posthog && npx nx lint posthog && npx nx build posthog`.

## Review Focus

1. A soft navigation (App Router link) must emit a `$pageview` and reset engaged time for the new pathname (Task 1 test "capture_pageview is the literal 'history_change'" plus Task 2 test "engaged time restarts on pathname change").
2. The proxy must not shadow first-party `/_/…` routes (Task 1 test "rewrites do not match /_/chat, /_/growth, /_/unsubscribe, /_/webhooks, /_/search-index").
3. A visitor who leaves before posthog-js loads must still produce one `marketing:pre_analytics_exit` beacon and never two (Task 1 beacon test "fires once on pagehide and is disarmed after init").
4. The website collector must never send a batch the route would reject: unknown contentId, bad UUID, stale `occurredAt`, or more than 20 events (Task 3 test "batches are route-valid under the PR 2 contract", which runs `parseCollectionBatch` from `@hashbrownai-internal/growth` over every batch the collector builds).
5. `quality:live` must flag a `marketing:cta_click` missing `cta_id` and a `docs:page_viewed` carrying an email-shaped property, and must not flag `utm_*` or `$*` properties (Task 5 analysis tests).

---

### Task 1: posthog-js, the `/_/ingest` proxy, and the pre-analytics beacon

**Files:**
- Modify: root `package.json` (add `posthog-js`, after Brian's OK), `www/next.config.ts` (rewrites, headers, `skipTrailingSlashRedirect`), `www/src/app/layout.tsx` (mount `PreAnalyticsBeacon` first in `<body>`)
- Create: `www/instrumentation-client.ts`, `www/src/lib/analytics/capture-gate.ts` (`shouldCaptureAnalytics({ token, captureLocal, host })`, `isLocalAnalyticsHost`), `www/src/lib/analytics/pre-analytics-beacon.ts` (`installPreAnalyticsBeacon(config)` self-contained, `preAnalyticsBeaconScript(config)`, `PRE_ANALYTICS_EVENT = 'marketing:pre_analytics_exit'`), `www/src/components/site/PreAnalyticsBeacon.tsx`
- Test: `www/test/analytics/instrumentation-client.spec.ts`, `capture-gate.spec.ts`, `pre-analytics-beacon.spec.ts`, `www/test/next-config.spec.ts` (extend `www/test/redirects.spec.ts` if a config spec already exists)

**Interfaces:**
- `POSTHOG_INIT_OPTIONS` exported from `www/instrumentation-client.ts` with exactly the Global Constraints options; the file calls `posthog.init(token, POSTHOG_INIT_OPTIONS)` behind the gate, then `window.__hashbrownPreAnalytics?.disarm()` unconditionally.
- Beacon payload: `{ api_key, event: 'marketing:pre_analytics_exit', distinct_id: <random uuid>, timestamp, properties: { $process_person_profile: false, $lib: 'hashbrown-pre-analytics-beacon', elapsed_ms, trigger ∈ 'pagehide' | 'visibilitychange', source_page: pathname, referrer_host, viewport_width, effective_type } }` sent once with `navigator.sendBeacon('/_/ingest/i/v0/e/?ip=0&beacon=1')`.

- [ ] **Step 1: Write the failing tests** (ported from threadplane's `instrumentation-client.spec.ts`, `pre-analytics-beacon.spec.ts`, `next.config.spec.ts`, rewritten as top-level tests):

```ts
test('POSTHOG_INIT_OPTIONS equals the pinned object', ...);                       // toEqual, whole object
test("capture_pageview is the literal 'history_change'", ...);                     // Review Focus 1, do not simplify
test('init runs with a token on a production host and on localhost only with capture-local', ...);
test('disarm runs once, after init, and also when there is no token', ...);
test('isLocalAnalyticsHost matches localhost, 127.0.0.1, ::1 and [::1]:3000', ...);
test('beacon fires once on pagehide and is disarmed after init', ...);             // Review Focus 3
test('beacon script escapes < as \\u003c', ...);
test('rewrites expose /_/ingest/static and /_/ingest in that order with CORS headers', ...);
test('rewrites do not match /_/chat, /_/growth, /_/unsubscribe, /_/webhooks, /_/search-index', ...); // Review Focus 2
```

- [ ] **Step 2: Run to see them fail.** Run: `npx vitest run --config www/vitest.config.mts www/test/analytics www/test/next-config.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** by copying and adapting; `next.config.ts` keeps its existing `redirects()`, `turbopack.root`, `outputFileTracingRoot`, and tracing includes.
- [ ] **Step 4: Run `npx nx test www && npx nx lint www && npx nx build www`.** Expected: PASS; the build output lists no new routes.
- [ ] **Step 5: Commit** `feat(www): posthog-js through the /_/ingest proxy with a pre-analytics beacon`

---

### Task 2: Website events and surfaces

**Files:**
- Create: `www/src/lib/analytics/events.ts` (constants, `AnalyticsSurface`, `CtaId`, `ThreadplaneSurface`, `AnalyticsProperties`), `client.ts` (`track`, `trackCtaClick`, `trackThreadplaneCtaClick`, `trackEngagedTime`, `trackDocsPageViewed`, `trackDocsCodeCopied`, `getSourcePage`), `engaged-time.ts` (`createEngagedTimeTracker`, `ENGAGED_TIME_THRESHOLDS_MS = [10_000, 30_000]`), `www/src/components/site/EngagedTimeSignal.tsx`, `www/src/components/docs/DocsPageViewSignal.tsx` (fires `docs:page_viewed` once per docs pathname with the framework from the path)
- Modify: `www/src/app/layout.tsx` (mount `EngagedTimeSignal`), the docs page layout (mount `DocsPageViewSignal`), `www/src/components/home/ThreadplaneBanner.tsx`, `www/src/components/site/Footer.tsx`, the docs platforms page link and blog threadplane links (`marketing:threadplane_cta_click` with the surface that matches the existing `utm_medium`), the home hero/install CTAs (`marketing:cta_click`), the copy button component (`docs:code_copied` with `language` from the code block)
- Test: `www/test/analytics/events.spec.ts`, `client.spec.ts`, `engaged-time.spec.ts`, plus assertions in the existing component specs (`www/test/home/*.spec.tsx`, `www/test/site/footer.spec.tsx`, `www/test/copy-button.spec.tsx`) that clicks call the tracker with the exact `cta_id`/`surface`

**Interfaces:**
- `events.ts`: `analyticsEvents = { marketingCtaClick: 'marketing:cta_click', marketingThreadplaneCtaClick: 'marketing:threadplane_cta_click', marketingEngagedTime: 'marketing:engaged_time', marketingAiCrawlerVisit, marketingAiReferralVisit, marketingPreAnalyticsExit, marketingUnstuckFormSubmit/Success/Fail, docsPageViewed: 'docs:page_viewed', docsCodeCopied: 'docs:code_copied' } as const`; `ThreadplaneSurface = 'homepage_banner' | 'footer' | 'docs_platforms' | 'blog' | 'email'`; `AnalyticsSurface = 'home' | 'nav' | 'footer' | 'docs' | 'blog' | 'unstuck'`; `CtaId` union of literal ids used by the components plus `` `copy_${string}` `` and `` `nav_${string}` ``.
- `client.ts`: `track(event, props)` adds `source_page: getSourcePage(location.href)` (pathname only, never query or hash), no-op on the server, try/catch with `console.error('[posthog] client capture failed:')`.
- `engaged-time.ts` as threadplane's: pure clock-based tracker, visible time only, each threshold once.

- [ ] **Step 1: Write the failing tests**

```ts
test('every event name matches ^(\\$pageview|(marketing|docs):[a-z_]+)$', ...);
test('track adds source_page as the pathname only and swallows capture errors', ...);
test('trackThreadplaneCtaClick sends surface and destination_url', ...);
test('engaged time counts only visible time and fires 10 then 30 once each', ...);
test('engaged time restarts on pathname change', ...);                          // Review Focus 1 (signal component)
test('ThreadplaneBanner click tracks marketing:threadplane_cta_click with homepage_banner', ...);
test('Footer threadplane link tracks with footer; docs platforms page with docs_platforms', ...);
test('copy button tracks docs:code_copied with pathname, framework and language', ...);
test('DocsPageViewSignal fires docs:page_viewed once per pathname with the framework', ...);
```

- [ ] **Step 2–5:** fail, implement, `npx nx test www && npx nx lint www`, commit `feat(www): website analytics events on the real surfaces`

---

### Task 3: The website collector

**Files:**
- Create: `www/src/lib/growth/website-metadata.ts` (`acquisitionProperties(search, referrer)`, `websiteTopic(pathname)`, `contentIdFor(pathname)`; the topic function is the single source of truth, and Task 3 also refactors `www/src/lib/growth/website-content.ts` to import it so the server catalog and the client agree), `www/src/lib/growth/website-collector.ts` (`createWebsiteCollector({ enabled, post, now, storage, subjectIdFactory })`, `installWebsiteCollector()`), `www/src/components/site/WebsiteCollectorSignal.tsx` (mounted in `layout.tsx`; reacts to `usePathname()`)
- Test: `www/test/growth/website-metadata.spec.ts`, `website-collector.spec.ts` (imports `parseCollectionBatch` from `@hashbrownai-internal/growth` to validate every batch the collector builds), extend `www/test/growth/website-content.spec.ts` (the catalog's topics equal `websiteTopic(path)` for every catalog path)

**Interfaces:**
- Identity: browser subject id (UUID v4) in `localStorage['hashbrown.growth.subject']` (scope `persistent`), falling back to `sessionStorage` (`session`) then memory (`memory`); session id (UUID v4) with a 30-minute inactivity window in `sessionStorage`, renewed on every event.
- Events: on install or session renewal, `website.session_started` with the acquisition properties; on every pathname, `website.content_viewed` once per session per pathname, only when `contentIdFor(pathname)` yields an id and `websiteTopic(pathname)` is not `other` (so the route never 400s a whole batch for an unknown page: unknown pages are not reported at all).
- Transport: coalesce events for 1 s, POST `{ schemaVersion: 1, events }` with `content-type: application/json` to `/_/growth/collect/v1/website`, `keepalive: true`; on 429 honour `Retry-After` once; on any other non-2xx drop silently; never more than 20 events per batch; `occurredAt` = send time's ISO string; `collectorVersion` from the www package version.
- Gate: `NEXT_PUBLIC_GROWTH_COLLECTION === 'true'` and the same local-host rule as Task 1's capture gate; respect `window.__HASHBROWN_TELEMETRY_DISABLED__`, `localStorage.HASHBROWN_TELEMETRY_DISABLED`, and `navigator.webdriver`.

- [ ] **Step 1: Write the failing tests**

```ts
test('acquisitionProperties lowercases and validates utm fields and referrerHost', ...);
test('websiteTopic maps every rule in the Global Constraints', ...);              // table
test('the server catalog and websiteTopic agree on every catalog path', ...);
test('session_started fires once per 30-minute session and renews on activity', ...);
test('content_viewed fires once per pathname per session and skips unknown pages', ...);
test('batches are route-valid under the PR 2 contract', ...);                     // Review Focus 4
test('a 429 waits Retry-After once; other failures drop silently', ...);
test('disabled, webdriver, and opt-out flags send nothing', ...);
```

- [ ] **Step 2–5:** fail, implement, `npx nx test www && npx nx lint www`, commit `feat(www): website collector for session and content observations`

---

### Task 4: AI crawler and referral middleware

**Files:**
- Create: `www/src/middleware.ts`, `www/src/lib/analytics/ai-traffic.ts` (`classifyAiCrawler(userAgent)`, `classifyAiReferrer(referrer)`, `shouldEmitCrawlerEvent`, `buildCapturePayload`, the token bucket)
- Test: `www/test/analytics/ai-traffic.spec.ts`, `middleware.spec.ts`

**Interfaces:** as threadplane's `middleware.ts` and `ai-traffic.ts` with the hashbrown matcher: pages plus `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`; exclude `_`, `api`, `_next`, `favicon.ico`, files with an extension, and `opengraph-image`/`twitter-image` routes. Crawler list and referrer host list verbatim. Distinct ids `ai_crawler:<slug>` / `ai_referral:<slug>`.

- [ ] **Step 1: Write the failing tests**

```ts
test('classifies known AI crawlers by longest token first', ...);
test('classifies referrers by exact host or subdomain', ...);
test('deduplicates crawler events per crawler, path and hour and caps keys at 2000', ...);
test('token bucket refuses the 501st emission in an hour', ...);
test('matcher excludes /_ paths, /api, _next and files with extensions', ...);
test('payload carries no person profile, no ip, and the middleware lib tag', ...);
```

- [ ] **Step 2–5:** fail, implement, `npx nx test www && npx nx lint www && npx nx build www`, commit `feat(www): AI crawler and referral visit events from Edge middleware`

---

### Task 5: PostHog tooling, contract, dashboards, taxonomy

**Files:**
- Create: `tools/posthog/project.json` (Nx project `posthog`: `lint`, `test` (vitest), `build` (`tsc --noEmit`), `sync:plan`, `sync:apply`, `report`, `quality:live`, `settings:plan`, `settings:apply`), `tools/posthog/package.json`, `tsconfig.json`, `tsconfig.spec.json`, `vitest.config.mts`, `env.ts`, `client.ts` (`fetch` with Bearer auth and the 429/502/503/504 retry; `PosthogClient` with `get/post/patch(path, body)` returning parsed JSON; no generated types), `schema.ts`, `telemetry-contract.ts`, `sync.ts`, `report.ts`, `live-quality.ts`, `settings.ts` (plan/apply `autocapture_opt_out: false` on the project), `README.md`
- Create: `tools/posthog/dashboards/{growth-overview,developer-funnel,threadplane-handoff}.json`, `tools/posthog/insights/*.json`, `docs/growth/taxonomy.md`
- Test: `tools/posthog/{env,schema,client,telemetry-contract,sync,report,live-quality,code-taxonomy,taxonomy}.spec.ts`

**Interfaces:**
- Contract entries (required / allowed / breakdowns): `$pageview` (– / `$pathname`, `title` / `$pathname`); `marketing:cta_click` (`cta_id`, `surface` / + `destination_url`, `source_section`, `source_page` / `cta_id`, `surface`, `source_page`); `marketing:threadplane_cta_click` (`surface` / + `destination_url`, `source_page` / `surface`, `source_page`); `marketing:engaged_time` (`engaged_seconds` / + `source_page` / `engaged_seconds`); `marketing:ai_crawler_visit` (`ai_crawler` / + `source_page`, `user_agent` / `ai_crawler`); `marketing:ai_referral_visit` (`ai_source` / + `source_page` / `ai_source`); `marketing:pre_analytics_exit` (– / `elapsed_ms`, `trigger`, `source_page`, `referrer_host`, `viewport_width`, `effective_type` / `trigger`); `docs:page_viewed` (`pathname`, `framework` / + `source_page` / `framework`, `pathname`); `docs:code_copied` (`pathname`, `framework`, `language` / + `source_page` / `framework`, `language`); `marketing:unstuck_form_submit|success|fail` (– / `surface`, `source_page`, `error_reason` / `surface`). `TELEMETRY_FORBIDDEN_PROPERTIES` = the Global Constraints list.
- Insights (all trends, daily, `-30d`): `pageviews-by-path`, `engaged-sessions` (`engaged_time` by `engaged_seconds`), `docs-reading-by-framework` (`docs:page_viewed` by `framework`), `code-copies-by-framework`, `cta-clicks-by-id`, `threadplane-handoff-by-surface`, `ai-crawlers` (`ai_crawler`), `ai-referrals` (`ai_source`), `pre-analytics-exits-by-trigger`. Dashboards: `growth-overview` (pageviews, engaged, docs reading, pre-analytics exits), `developer-funnel` (pageviews, docs reading, code copies, cta clicks), `threadplane-handoff` (handoff by surface, cta clicks). `posthog_id` null until `sync:apply` writes it back.
- `live-quality.ts`: `DEFAULT_LIVE_COVERAGE_REQUIREMENTS` = `$pageview` ≥ 1 and `marketing:engaged_time` ≥ 1; ignored property names include `utm_*`, `$*`, `token`, `uuid`, `distinct_id`, click ids.
- `code-taxonomy.spec.ts` scans `www/src`, `www/instrumentation-client.ts`, and `www/src/middleware.ts` for `posthog.capture('x'`, `track('x'`, `analyticsEvents.KEY`, and the middleware/beacon event constants, and asserts each name appears in backticks in `docs/growth/taxonomy.md`; `taxonomy.spec.ts` asserts every insight event is in the taxonomy; `telemetry-contract.spec.ts` asserts every insight event, breakdown and filter is allowed by the contract and forbidden properties are never allowed.

- [ ] **Step 1: Write the failing tests** (ported and rewritten as top-level tests; the live-quality analysis tests include Review Focus 5):

```ts
test('env requires a 20-char key and a positive integer project id', ...);
test('client retries 429/502/503/504 three times with capped backoff', ...);
test('schema rejects a funnel without steps and an operator needing a value', ...);
test('computePlan matches by posthog_id then by unambiguous name and lists orphans', ...);
test('applyPlan creates insights before dashboards and never deletes without the flag', ...);
test('report marks funnels, unique counts, breakdowns and stale data Unavailable', ...);
test('quality flags a cta_click missing cta_id and a page_viewed with an email-shaped property, ignores utm_* and $*', ...); // Review Focus 5
test('quality fails coverage when $pageview or engaged_time has no events', ...);
test('every event fired in www is in the taxonomy', ...);
test('every insight event, breakdown and filter is allowed by the contract', ...);
```

- [ ] **Step 2–5:** fail, implement, `npx nx test posthog && npx nx lint posthog && npx nx build posthog`, commit `feat(posthog): contract, dashboards as code, report, and live quality check`

---

### Task 6: CI and docs

**Files:**
- Create: `.github/workflows/posthog-quality.yml` (daily `23 14 * * *` and `workflow_dispatch` with `days`/`limit_per_event`; `POSTHOG_PERSONAL_API_KEY: ${{ secrets.POSTHOG_PERSONAL_API_KEY_READONLY }}`, `POSTHOG_PROJECT_ID: ${{ secrets.POSTHOG_PROJECT_ID }}`, `POSTHOG_HOST: https://us.i.posthog.com`, `DO_NOT_TRACK=1`; fails with `::error::` when a secret is missing; runs `npx nx run posthog:quality:live -- --days … --limit-per-event … --require-critical-coverage`)
- Modify: `.github/workflows/pr-main.yml` (a `posthog-sync-plan` job that runs `npx nx run posthog:sync:plan` with the read-only key when `tools/posthog/**` changed, soft-skipping without the secret), `.env.example` (`NEXT_PUBLIC_POSTHOG_TOKEN`, `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL`, `NEXT_PUBLIC_GROWTH_COLLECTION`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PERSONAL_API_KEY_READONLY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`), `AGENTS.md` (the `posthog` targets), `tools/vercel/bootstrap.mjs` (`NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL` and `NEXT_PUBLIC_GROWTH_COLLECTION` on the www target's `env`; both default unset), the runbook `docs/superpowers/runbooks/2026-10-21-growth-website-analytics.md` (what is measured and what is not, the measurement limits from threadplane's README adapted, how to run sync/report/quality, the project-level settings that only the PostHog UI or `settings:apply` can change, the bounce-rate caveat, and how to turn the website collector on: set `NEXT_PUBLIC_GROWTH_COLLECTION=true` on www only after `website` is in `GROWTH_COLLECTION_SOURCES` and the PR 2 production checklist is done)

- [ ] **Step 1:** write the workflow, job, env keys, docs; `npx nx lint posthog` and a YAML lint of the workflow.
- [ ] **Step 2: Commit** `ci(posthog): daily telemetry quality check and dashboard drift check`

---

### Task 7: Live verification

- [ ] Brian supplies a read-only PostHog personal API key for CI; set `POSTHOG_PERSONAL_API_KEY_READONLY` and `POSTHOG_PROJECT_ID` as GitHub secrets with `gh secret set`.
- [ ] `npx nx run posthog:settings:apply` (autocapture on) and `npx nx run posthog:sync:apply` against project 677870 with the full key from the root `.env`; commit the written-back `posthog_id`s. Rerun `sync:plan`; expected: no changes.
- [ ] Run `next dev` with `NEXT_PUBLIC_POSTHOG_TOKEN`, `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL=true`, `NEXT_PUBLIC_GROWTH_COLLECTION=true`, `GROWTH_COLLECTION_SOURCES=website`, `DATABASE_URL` = the test store; browse the home page, a docs page, copy a snippet, click the threadplane banner, stay 30 s; expected in PostHog: `$pageview`, `docs:page_viewed`, `docs:code_copied`, `marketing:threadplane_cta_click`, `marketing:engaged_time` 10 and 30; expected in the test store: one `website.session_started` and the `content_viewed` rows; then `npx nx run posthog:quality:live -- --days 1 --require-critical-coverage` passes; `npx nx run posthog:report` writes a markdown report. Clean the test-store rows. Record outputs without identifiers.
