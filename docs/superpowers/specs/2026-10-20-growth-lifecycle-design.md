# Hashbrown growth and lifecycle management

Date: 2026-10-20. Status: draft for approval.

Hashbrown gets its own growth layer, modelled on the one threadplane runs today
(`~/repos/angular-agent-framework`, under `libs/growth`, `libs/telemetry`,
`apps/lifecycle`, `apps/website/src/app/api`, `tools/posthog`, `migrations`).
Where this document says "mirror threadplane", the builder copies the threadplane
implementation and adapts names, copy, and milestones; it does not redesign it.
Where this document says "differs", the hashbrown version is specified here.

The word "tracking" does not appear in hashbrown's public copy, package READMEs,
docs, or code identifiers. Use observation, collection, signals, milestones,
analytics, and lifecycle. The one exception is the ecosystem-standard
`DO_NOT_TRACK` environment variable, which is honoured because developers already
set it.

## 1. Intent and why

Two goals, in priority order.

1. **Nobody stalls silently.** Today someone runs `npm install @hashbrownai/core`
   and hashbrown has no idea they exist, where they got to, or where they stopped.
   This layer observes a small set of milestones after install, projects them into
   a funnel, and lets Brian reach out, engineer to engineer, to people who are
   stuck.
2. **A gentle hand-off to threadplane.** Hashbrown is headless. People who are
   building a full chat UI by hand should hear, once and plainly, that threadplane
   exists and is the same team's finished agent UI. This is a fixed line of copy,
   not a triggered campaign.

Threadplane already runs this exact system in production. Reusing it means the
hashbrown version inherits its privacy posture, its deliverability rules, its
job-queue correctness, and its reporting, instead of rebuilding them.

## 2. Goals, non-goals, anti-goals

### Goals

- Observe `package.installed`, one runtime session start, and three runtime
  milestones per development browser, linked to the install when possible.
- Store observations, contacts, approvals, stops, jobs, and delivery state in a
  Neon Postgres database that is the single source of truth for who may be
  emailed. PostHog measures engagement and never authorizes a send.
- Run a lifecycle worker on b4.run (the runtime formerly called Dawn) that
  fulfils form submissions, sends one fixed three-step founder sequence through
  Resend, sends internal notifications, and sends a daily install digest.
- Add a "Get unstuck" contact form on hashbrown.dev that enrolls the person in
  the founder sequence with a visible disclosure.
- Ship funnel, journey, and health reports, and PostHog dashboards as code, so
  the stall points are visible without reading the database by hand.
- Document everything collected and every opt-out in the package READMEs and a
  single `/privacy` page.

### Non-goals (this round)

- Company enrichment, research, page capture, LangSmith, or any model call in the
  lifecycle worker. The `enrich` and `research_cleanup` job kinds, `libs/growth-capture`,
  `apps/growth-research`, and the `company_enrichment.v1` artifact are not ported.
- Email copy that varies by milestone, score, or research angle. Threadplane does
  not do this either; its only variation is the research angle, which is out.
- A shared growth codebase between hashbrown and threadplane. Each product keeps
  its own copy in its own repository.
- Newsletter, whitepaper, pricing, or enterprise forms. One form only.
- Social publishing, Search Console reporting, or a website privacy banner.
- Lifecycle state columns, product-qualified or sales-qualified states, CRM or
  billing integration.
- In-app nudges inside hashbrown's runtime beyond the console announcement
  mechanism threadplane already has.

### Anti-goals

- Anything a developer would reasonably call spying. No conversation content,
  prompts, tool arguments, schemas, endpoints, thread or run IDs, URLs, or
  stack traces ever leave the browser. No identity in browser code.
- A cold email that reads as surveillance. The draft linter's surveillance
  pattern stays, and "I saw you" copy is rejected at build time.
- Production impact. The runtime collector is inert in production builds, SSR,
  CI, and automated browsers, and the postinstall exits within 4.8 seconds.
- Double sends or sends after a stop. Every stop is one idempotent transaction;
  every send re-authorizes against Neon immediately before Resend.

## 3. Constraints

- Hashbrown is an Nx monorepo with no `apps/` directory. Internal, unpublished
  projects live under `tools/`. Published packages are `packages/*`, built by
  rollup (core, react, providers) or ng-packagr (angular) into `dist/packages/*`.
- Deployments go through GitHub Actions (`.github/workflows/deploy.yml`, driven
  by the `DEPLOY_TARGETS` JSON in `pr-main.yml`), which runs `vercel build` and
  deploys prebuilt output. The www project is deployed with root `www`.
- The www Next.js app keeps non-page server routes under `www/src/app/%5F/`,
  which serves as `/_/...`. `www/src/app/api/` is the API reference docs and is
  not available for route handlers.
- Core must stay framework-agnostic. Anything shared with React and Angular but
  not meant for end users is exported with the `ɵ` prefix. Public React and
  Angular signatures never expose `ɵ` types.
- No new dependency is added to a published package. The install collector is
  dependency-free CommonJS, as in threadplane. The runtime collector uses only
  browser APIs.
- Tests use top-level `test(...)` with arrange, act, assert. New public
  functionality carries TSDoc.
- Vendor accounts: a new PostHog project, and Neon as Vercel Marketplace
  integration stores on hashbrown's Vercel team (the team already has the Neon
  integration installed), one store per target: growth production, growth
  preview, b4.run state production, b4.run state preview. The stores inject
  `DATABASE_URL` (and `B4_DATABASE_URL` through the `B4_` env var prefix) into
  the connected Vercel projects, exactly as threadplane's team does. No Neon API
  key is used. Resend is threadplane's existing account with the
  `hashbrown.dev` domain added and verified. The `brian@hashbrown.dev` Google
  Workspace mailbox does not exist yet and is created as part of rollout.
- Provisioning is done by the builder through the vendors' APIs using personal
  access tokens Brian supplies (Neon, PostHog, Vercel, Resend). Tokens are never
  committed, never echoed in output, and are revoked by Brian after
  provisioning. The provisioning steps are scripted under
  `tools/growth/scripts/provision-*.mts` so they are repeatable and reviewable.

## 4. Decisions made in brainstorming

These are Brian's decisions and are not up for reinterpretation by the builder.

| Decision                | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signals                 | Mirror threadplane's collection: postinstall collector in the packages, development-browser runtime collector, website session and content views, server-side form acceptance.                                                                                                                                                                                                                                                                      |
| Milestones              | Four: `package.installed`, `runtime.first_stream_completed`, `tool.first_call_executed`, `component.first_rendered`.                                                                                                                                                                                                                                                                                                                                |
| Worker runtime          | b4.run, on the current `@b4run/*` packages (0.14 at the time of writing), not the `@dawn-ai/*` 0.8.26 line threadplane's `apps/lifecycle` is still pinned to. The dispatcher, job, and template code mirror threadplane; the config, CLI wrapper, Vercel adapter, and state-database binding are rebuilt against b4.run's own Vercel target and verified the same way (`verify-vercel-adapter`). This is the one place "mirror" means re-implement. |
| Enrichment and research | Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Email customization     | None. One fixed three-step founder sequence; milestones feed internal analytics only.                                                                                                                                                                                                                                                                                                                                                               |
| Enrollment sources      | The founder install digest with one-click approve, a "Get unstuck" contact form on hashbrown.dev, and install-runtime hello (work-domain installers whose runtime session links to the same email).                                                                                                                                                                                                                                                 |
| Code location           | Copied and adapted into the hashbrown monorepo as private Nx projects. No shared package with threadplane.                                                                                                                                                                                                                                                                                                                                          |
| Accounts                | A separate PostHog project. (Neon and Resend separation are the author's call, see §12.)                                                                                                                                                                                                                                                                                                                                                            |

## 5. Architecture

### 5.1 Projects

| Project            | Path                                                             | Mirrors                                  | Role                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `growth`           | `tools/growth`                                                   | `libs/growth`                            | `@hashbrownai-internal/growth`: contacts, approvals, stops, observations, projection, facts, jobs, Resend sender, webhooks, tokens, scoring, reports. Raw SQL over `@neondatabase/serverless`. |
| `growth-collector` | `tools/growth/install`                                           | `libs/telemetry/install`                 | Dependency-free CJS postinstall collector, assembled into each published package at build.                                                                                                     |
| `lifecycle`        | `tools/lifecycle`                                                | `apps/lifecycle`                         | b4.run app on Vercel Node 24: job dispatcher, fulfillment, founder sequence, notifications, install digest.                                                                                    |
| `posthog`          | `tools/posthog`                                                  | `tools/posthog`                          | Event contract, dashboards as JSON, quality check, report.                                                                                                                                     |
| migrations         | `tools/growth/migrations/NNNN_*.sql`                             | `migrations/`                            | Growth schema. Applied with `npx nx migrate-growth growth`.                                                                                                                                    |
| www routes         | `www/src/app/%5F/...`                                            | `apps/website/src/app/api/*`             | Collection, ingest proxy, form, unsubscribe, stop, approve, Resend webhook, reply intake, cron.                                                                                                |
| www pages          | `www/src/app/unstuck`, `www/src/app/privacy`, `www/src/app/call` | `/contact`, `/privacy`, `/call`          | The form page, the privacy policy, and the booking redirect.                                                                                                                                   |
| core               | `packages/core/src/growth/`                                      | `libs/telemetry/src/browser/development` | Development runtime collector, exported `ɵ`-prefixed.                                                                                                                                          |
| react, angular     | existing packages                                                | adapter wiring                           | Pass dev-mode and the `telemetry: false` option into core's collector.                                                                                                                         |
| operator scripts   | `tools/growth/scripts/growth-*.mts`                              | `scripts/growth-*.mts`                   | `report`, `control`, `observability`.                                                                                                                                                          |

Nx target names follow the existing repo (`build`, `test`, `lint`), plus
`migrate-growth` on `growth`, and `report`, `control`, `observability` run
through `npx nx <target> growth -- <args>`.

### 5.2 Data flow

```
packages (postinstall) ──package.installed──▶ /_/growth/collect/v1/install ─┐
browser (dev mode)     ──runtime.*──────────▶ /_/growth/collect/v1/runtime ─┤
www (posthog-js)       ──website.*──────────▶ /_/growth/collect/v1/website ─┼─▶ Neon observations
www /unstuck form      ──form.accepted──────▶ /_/forms/unstuck ─────────────┘        │
                                                                                      ▼
Vercel cron (*/30) ──▶ /_/cron/lifecycle ──bearer──▶ lifecycle (b4.run) ──▶ projection → facts
                                                                     ├──▶ campaign enrollment (approved contacts only)
                                                                     ├──▶ lease due jobs → Resend (send_step, fulfill, notify, digest)
Resend webhooks ──svix──▶ /_/webhooks/resend ──▶ delivery status / stops                │
Gmail poller ──hmac──▶ /_/growth/replies/google ──▶ campaign.reply_received → stop        │
posthog-js / core ──▶ /_/ingest ──▶ PostHog (engagement only) ◀──────── dashboards as code
```

Ownership rule, copied verbatim in spirit: Neon is authoritative for contact
eligibility and lifecycle outcomes. PostHog measures engagement. Nothing in
PostHog can authorize a send.

## 6. Signals

### 6.1 Namespaces and naming

Neon observation kinds are `dot.case`. PostHog events are `namespace:snake_case`
with namespaces `marketing:*`, `docs:*`, and `hb:*` (threadplane's `tplane:*`).
The PostHog contract in `tools/posthog/telemetry-contract.ts` forbids the
properties `prompt`, `messages`, `threadId`, `runId`, `apiUrl`, `url`, `error`,
`schema`, `toolArgs`, and `componentProps`.

Subject namespaces are unchanged: `website_session`, `installation`,
`development_browser`.

### 6.2 Install collector (mirror)

Shipped in every published package: `core`, `react`, `angular`, `openai`,
`anthropic`, `azure`, `bedrock`, `google`, `ollama`, `typesafe`. The provider
package name is the only way to learn which model vendor a developer chose, so
all ten carry it. The source lives once in `tools/growth/install`; each package
build copies `install/*.cjs` into `dist/packages/<name>/install` and adds
`"postinstall": "node install/postinstall.cjs"` to the published `package.json`.
The in-repo `packages/*/package.json` files do not carry the script, so the
monorepo's own `npm ci` never runs it.

Behaviour (mirror `policy.cjs`, `collector.cjs`, `git-context.cjs`,
`identity.cjs`, `files.cjs`):

- Disabled when any of `DO_NOT_TRACK`, `npm_config_do_not_track`,
  `NPM_CONFIG_DO_NOT_TRACK`, `HASHBROWN_TELEMETRY_DISABLED` is truthy, or when
  `npm_lifecycle_event` is not `postinstall`.
- CI detection via the same indicator list; CI installs are reported as
  `environment: ci` with no Git identity, and reset the package-local token to
  null.
- Hard deadline 4,800 ms, exit 0 on every path, never throws.
- Emits one `package.installed` with `package`, `version`, `packageManager`,
  `packageManagerVersion`, `environment`, `environmentEvidence`, `nodeMajor`,
  `os`, and, when configured locally and not CI, Git `user.name`, `user.email`,
  and a repository-owner hint from the origin remote.
- In `@hashbrownai/core` only, writes a random UUID installation token to
  `dist/packages/core/development-install.js` (published as the
  `./development-install` export, null by default, read by core through a
  `#development-install` imports-map entry) so the browser collector can cite
  it without any identity in browser code. Production bundler conditions drop
  it. The other nine packages emit `package.installed` and write no token; the
  install observation still names the package, so vendor choice is visible in
  the funnel, and the runtime session's `integration` property supplies the
  framework. One token per envelope keeps `growth_install_runtime_links`
  identical to threadplane's shape. (Author's call.)
- Posts to `https://hashbrown.dev/_/growth/collect/v1/install`.

`HASHBROWN_TELEMETRY_DEBUG=1` prints the payload and endpoint and sends nothing.

### 6.3 Runtime collector (mirror, with hashbrown milestones)

Lives in core as `packages/core/src/growth/`, exported as `ɵcreateDevelopmentCollector`,
`ɵreportMilestone`, `ɵsetDevelopmentCollectionEnabled`, and
`ɵgetDevelopmentCollectionDiagnostics`. React and Angular re-export
`setDevelopmentCollectionEnabled` and `getDevelopmentCollectionDiagnostics`
under their public names, with non-`ɵ` types.

Gating, identical to threadplane: starts only when the framework adapter says
development mode is on (Angular `isDevMode()`; React `process.env.NODE_ENV !== 'production'`
as replaced by the bundler), `window` and `localStorage` APIs exist,
`navigator.webdriver` is false, and none of these opt-outs is set:

- `localStorage.HASHBROWN_TELEMETRY_DISABLED = '1'`
- `window.__HASHBROWN_TELEMETRY_DISABLED__ = true`
- `setDevelopmentCollectionEnabled(false)` before the runtime is constructed
- `telemetry: false` on `HashbrownProvider` (React) or `provideHashbrown()`
  (Angular). A child runtime cannot override a disabled parent.

Identity: a browser-origin UUID and a 30-minute inactivity session UUID in
localStorage, with page-memory fallback reported as scope. Immutable
initialization envelopes survive reloads. Changing package version or
installation token starts a new envelope.

Events:

| Kind                             | When                                                                                               | Hook site                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `runtime.session_started`        | Once per integration per session, when a chat runtime is created in a development browser          | `createChatRuntime` in `packages/core/src/chat-runtime.ts`                                               |
| `runtime.first_stream_completed` | First `RUN_FINISHED` after at least one `TEXT_MESSAGE_CONTENT` or structured-output chunk in a run | `ag-ui-run-driver.ts` `onEvent`, or the status reducer's generating→idle transition                      |
| `tool.first_call_executed`       | First client tool handler resolves (success or error)                                              | `effects/tool-turn-executor.ts`                                                                          |
| `component.first_rendered`       | First exposed component is rendered from a UI chat, or the first `decision` selects a component    | React `expose-component.fn.ts` render path and Angular `components/` render path, reporting through core |

Milestones are deduplicated per integration per session, coalesced with at
least ten seconds between requests, capped at 50 pending and 20 per request,
three attempts, 24-hour age, three-second request deadline, respect
`Retry-After`, and never poll while idle. Allowed properties are `package`,
`version`, `integration` (`react` | `angular`), `transport` (`http` | `local` |
`delegating` | `custom`), `provider` when the transport names one, and a
`durationBucket` on `runtime.first_stream_completed`.

Announcements: the collector may display a code-owned plain-text console
announcement at most once per identity, with package/version applicability and
expiry, linking only to `https://hashbrown.dev/docs/...` paths. No remote code,
no HTML. The first announcement shipped is the "Get unstuck" pointer (§8.4).

One announcements catalog (`www/src/lib/announcements/catalog.ts`) feeds both
the site pill and the runtime announcements. An entry reaches development
collectors only when it has a `runtime` block with a `hashbrown.dev/docs` link.

### 6.4 Website signals (mirror)

`www/instrumentation-client.ts` initialises posthog-js through the `/_/ingest`
reverse proxy with `capture_pageview: 'history_change'`,
`person_profiles: 'always'`, and no session recording. Server-side
`website.session_started` and `website.content_viewed` (pathname only) go to
`/_/growth/collect/v1/website`. PostHog events:

- `marketing:cta_click` (`ctaId`, `surface`), `marketing:engaged_time`
  (10 s and 30 s of visible time, no viewport gate), `marketing:ai_crawler_visit`,
  `marketing:ai_referral_visit`
- `docs:page_viewed` (`pathname`, `framework`), `docs:code_copied` (`pathname`,
  `framework`, `language`)
- `marketing:unstuck_form_submit`, `marketing:unstuck_form_success`,
  `marketing:unstuck_form_fail`
- `marketing:threadplane_cta_click` (`surface`: `homepage_banner` | `footer` |
  `docs_platforms` | `blog` | `email`): the hand-off goal's one measurable.

The `/_/ingest` route uses posthog-node with a closed allowlist in
`tools/growth/src/ingest.ts`; unknown event names are dropped.

### 6.5 Funnel semantics

Per `installation` or `development_browser` subject:

| Stage                        | Definition                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Installed                    | `package.installed` from a non-CI environment                                      |
| Started                      | `runtime.session_started`                                                          |
| Streamed                     | `runtime.first_stream_completed`                                                   |
| Used a tool                  | `tool.first_call_executed`                                                         |
| Rendered a component         | `component.first_rendered`                                                         |
| Activated                    | All three runtime milestones within 30 days of the first `runtime.session_started` |
| Stalled before first request | Installed, no `runtime.session_started` within 3 days                              |
| Stalled after hello world    | Streamed, no tool call and no component within 7 days                              |
| Returned                     | A second session on a later calendar day within 7 days (`project.returned_7d`)     |

Threadplane's 30-minute activation window becomes 30 days (author's call: a
library is evaluated over evenings, not in one sitting). The `growth_funnel_daily_v1`
view gains the two stall columns. Stall is a reporting concept only; it never
sends anything.

### 6.6 Scoring (mirror, renamed reasons)

`growth-score-policy:v1` keeps threadplane's deterministic set-based tiers
(low, medium, high, very_high) with reason codes `milestone.started`,
`milestone.streamed`, `milestone.tool`, `milestone.component`,
`project.returned_7d`, `contact.approved_work_email_form`,
`contact.approved_install_digest`, and `content.docs_engaged`. The score orders
the install digest and the funnel report. It never authorizes a send.

## 7. Persistence

Copy threadplane migrations `0002` through `0008` as hashbrown `0001` through
`0007`, with these changes:

- Drop `growth_artifacts` columns and tables that exist only for research
  (`research_attempt`, enrichment artifacts). Keep `growth_artifacts` for
  rendered campaign drafts and digest reports.
- Drop `growth_projects.claim_key_hash` and the `/connect` claim flow; hashbrown
  has no explicit project-claim form. Keep `posthog_distinct_id`.
- Job `kind` enum is `fulfill | notify | send_step | digest | reply_reconcile`.
- Table prefix stays `growth_`. Views keep their `_v1` names.
- Threadplane's `0001` (`rate_limit_events` for the demo proxy) is not ported.

Tables, for the builder's orientation: `growth_contacts` (email citext,
`email_lookup_hmac`, `source`, `outreach_approved_at`, `deleted_at`),
`growth_projects`, `growth_activity` (append-only ledger, `event_key UNIQUE`),
`growth_jobs` (status `pending|leased|completed|failed|cancelled`, lease,
attempts, `idempotency_key`, `available_at`, `provider_email_id`,
`rfc_message_id`, `gmail_seed_message_id`, `delivery_status`),
`growth_observation_subjects|observations|identities|redactions|work|facts`,
`growth_collection_budgets`, `growth_observation_operations`,
`growth_observation_form_links`, `growth_install_runtime_links`,
`growth_install_digest_reports`.

Two database URLs, never falling back to each other: `DATABASE_URL` (growth)
and `B4_DATABASE_URL` (b4.run threads, checkpoints, permissions). Preview and
production use different Neon resources for both.

## 8. Email

### 8.1 Sender and transport (mirror)

- From and Reply-To: `Brian at Hashbrown <brian@hashbrown.dev>` (see §12 for
  the mailbox question).
- Every recipient-facing message carries `List-Unsubscribe`,
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and `X-Hashbrown-Job-ID`.
- Resend idempotency key is the job's idempotency key.
- Tags: `environment`, `job_kind`, `campaign_version`, `campaign_step`,
  `campaign_template`.
- Open and click tracking off; the sender refuses to run unless
  `RESEND_TRACKING_DISABLED=true` is set.
- Plain text body plus the plain HTML alternative (paragraphs and HTTPS anchors
  only) so the footer can read "click here to unsubscribe".
- BCC Brian on every message that may begin a conversation, so the Gmail poller
  can register the seed Message-ID.
- Non-production: `RESEND_NON_PRODUCTION_ALLOWLIST` and
  `RESEND_NON_PRODUCTION_REDIRECT_TO` as in threadplane.

### 8.2 Enrollment

Only `outreach_approved_at` authorizes a send. It is set by exactly three paths:

1. **Get unstuck form** accepted with the visible disclosure (§8.4). The exact
   disclosure string and version are recorded in `growth_activity` as
   `form.outreach_approved`.
2. **Founder install digest** approve link, which creates and approves the
   contact through the founder reauthorization path (`contact.reauthorized`,
   `provenance = 'founder_action'`).
3. **Install-runtime hello**, recorded as `install_runtime.outreach_approved`
   and backed by an `approved` row in `growth_install_runtime_links`. It
   applies only to work-domain emails (the same `PERSONAL_EMAIL_DOMAINS`
   exclusion as the digest) and never to CI or redacted installs or installs
   with two different emails. It runs only when both
   `CAMPAIGN_ENROLLMENT_ENABLED` and `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED` are
   `true`, so a contact is never approved before the immutable
   `CAMPAIGN_ENROLLMENT_START_AT` and stranded.

Each contact is enrolled at most once (`materializeCampaignEnrollment`).
Enrollment reason is `unstuck_form`, `install_digest` or `install_runtime`; all
get identical copy. Anonymous observations never enroll anyone.

### 8.3 Schedule (mirror)

Step 1 at 07:00 Pacific on the next weekday; step 2 three business days after
step 1 is accepted by Resend; step 3 five business days after step 2. Sends are
leased only Monday to Friday 07:00 to 08:00 Pacific, batch size 20. Due times live
in `growth_jobs.available_at`. The cron is `*/30 * * * *` in `www/vercel.json`,
calling `/_/cron/lifecycle`, which forwards to the lifecycle service with the
bearer token. The form route nudges lifecycle immediately after its transaction
commits; the cron is the fallback.

### 8.4 Get unstuck form

Page `/unstuck`, linked from the docs sidebar footer ("Stuck? Ask Brian"), the
site footer, the runtime console announcement, and the package READMEs.

Fields:

| Field                | Type                             | Rule                                                                                                                                                            |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email                | required                         | Full address; error copy "Enter a full address, like jordan@acme.dev."                                                                                          |
| Framework            | required select                  | React, Angular, Both, Not sure yet                                                                                                                              |
| Where are you stuck? | required textarea                | 20 to 1,000 characters; stored as a bounded fact, never sent to PostHog                                                                                         |
| Disclosure           | muted paragraph above the button | "By sending, you agree Brian may follow up by email about your request, including a short three-email note about building with Hashbrown. Unsubscribe anytime." |

Validation on blur, final pass on submit, focus to first invalid field,
`aria-describedby` on errors and on the button for the disclosure. Success:
"Got it. Brian reads every one of these and replies from brian@hashbrown.dev."
Failure offers `mailto:brian@hashbrown.dev`.

Server: `POST /_/forms/unstuck` validates with Zod 4, rate-limits by IP and by
`email_lookup_hmac`, persists the contact and the bounded submission in one
transaction, records `form.accepted` and `form.outreach_approved`, enqueues
`fulfill` (acknowledgement), `notify` (internal, includes the text), and
`send_step` 1, then nudges lifecycle.

Acknowledgement email (fulfillment, plain text, author's draft, Brian edits):

> Subject: Got your note
>
> Thanks for writing. I read every one of these myself and I'll reply with
> something useful, usually within a business day.
>
> If it helps in the meantime, the docs for the part you're on are at
> https://hashbrown.dev/docs.
>
> Brian

### 8.5 The founder sequence (author's draft, Brian edits)

All three steps are founder session offers, at most 120 words, one link, one
question, no HTML, no surveillance language. The draft linter from threadplane
runs on every template at test time. Approved links are
`https://hashbrown.dev/docs`, `https://hashbrown.dev/unstuck`,
`https://threadplane.ai`, and `FOUNDER_BOOKING_URL = https://hashbrown.dev/call`,
a first-party redirect to Brian's Google Calendar appointment page.

Step 1, immediate, no link:

> Subject: Engineer to engineer
>
> Saw you were checking out Hashbrown and wanted to drop a quick note.
>
> I'm the founding engineer, and I'm offering short engineer-to-engineer
> sessions to think through your generative UI, unblock whatever's in the way,
> and avoid the common mistakes. No sales, just getting you going.
>
> What are you building?

Step 2, three business days later:

> Subject: Get your generative UI working
>
> Even with agents writing much of our code, teams still get stuck: the first
> stream, the first tool call, the first component the model renders.
>
> I can work through any of it with you in a 30-minute hands-on session. Fix the
> bug, get your code working.
>
> No sales. Just a founding engineer meeting with you and your team.
>
> Book a time with me:
> https://hashbrown.dev/call

Step 3, five business days later, carries the threadplane hand-off:

> Subject: One last note from the Hashbrown founder
>
> One last note.
>
> I'd still like to get on a call to help you fix any bugs and hear what would
> make Hashbrown better.
>
> And if what you actually need is a finished chat UI rather than a headless
> one, threadplane is ours too, built on Hashbrown, with threads, approvals, and
> tool progress out of the box: https://threadplane.ai
>
> Grab some time on my calendar: https://hashbrown.dev/call
>
> This is my last automated follow-up.

Step 3 has two links, so the linter's one-link rule is relaxed to two for the
final step only, with the threadplane URL in the approved list. Author's call;
if Brian prefers one link, the booking link stays and the threadplane line
becomes plain text.

### 8.6 Stops, webhooks, replies (mirror)

Stop reasons `unsubscribe, complaint, hard_bounce, provider_suppression,
invalid_address, manual_suppression, campaign.reply_received, deletion`, each
one idempotent transaction that clears approval and cancels pending jobs.
Resend webhook at `/_/webhooks/resend`, Svix-verified, mapping `email.sent |
delivered | delivery_delayed | bounced | complained | suppressed | failed` with
threadplane's precedence; environment-tag mismatches are acknowledged and
ignored. HMAC-signed action tokens with purposes `unsubscribe | founder_stop |
founder_approve_install`, served at `/_/unsubscribe`, `/_/growth/stop`,
`/_/growth/approve-install` on `GROWTH_PUBLIC_ACTION_ORIGIN`. Reply detection
through the Google Apps Script mailbox poller (`tools/growth/mailbox-poller`),
`gmail.metadata` scope, HMAC-signed POSTs to `/_/growth/replies/google`. Reply
bodies are never stored.

### 8.7 Founder install digest (mirror)

One `digest` job per Pacific business day (`install_digest:<YYYY-MM-DD>`) is
enqueued when at least one non-CI installer with a work-email domain has no
contact and has not been reported. It is due at 07:00 Pacific
(`nextPacificBusinessMorning`), not at the first tick after midnight. Plain text to `FOUNDER_NOTIFICATION_EMAIL`, one line per
identity with package, version, framework if a runtime session linked, highest
milestone reached, score tier, and a seven-day signed approve link. It never
emails the installer and never creates a contact.

## 9. Analytics and reporting

- `tools/posthog/dashboards/`: `growth-overview`, `developer-funnel`,
  `runtime-milestones`, `threadplane-handoff` (CTA clicks by surface over time),
  plus their insights. `npx nx analytics-plan posthog` compares, `analytics-report`
  fetches, `analytics-quality -- --days 7` validates live events against the
  contract. The nightly workflow runs the quality check.
- SQL views `growth_contact_overview_v1`, `growth_funnel_daily_v1` (with stall
  columns), `growth_campaign_performance_v1`, `growth_job_health_v1`,
  `growth_observation_source_health_v1`, `growth_observation_subject_overview_v1`,
  `growth_observation_work_health_v1`.
- Operator commands: `npx nx run growth:report -- funnel --from <UTC> --to <UTC>`
  (at most 31 days), `-- journey --contact <uuid>`, `-- health`, `-- timeline`,
  `-- detail`; `npx nx control growth -- status|approve|stop|delete --email <addr>`;
  `npx nx observability growth -- initialize-redactions`.
- No admin UI.

## 10. Privacy and disclosure

- `/privacy` on hashbrown.dev, general data-category language, naming Vercel,
  Neon, PostHog, Resend, and Google Workspace as processors, indefinite default
  retention, how to request deletion, email opt-out and reply handling.
- Each package README gets a short "What this package sends" section: the
  install collector, what it includes (package, version, environment, Git
  identity when configured), the runtime collector's development-only
  behaviour, and every opt-out (`DO_NOT_TRACK`, `HASHBROWN_TELEMETRY_DISABLED`,
  the localStorage key, the window flag, `telemetry: false`). Link to `/privacy`.
- A docs page `docs/{react,angular}/platform/collection.md` says the same thing
  in the docs voice.
- Deletion: `npx nx control growth -- delete --email` nulls raw contact fields,
  removes the project mapping, cancels jobs, and runs the observation redaction;
  `email_lookup_hmac` and the stop audit remain to prevent re-contact.

## 11. Security (mirror)

- Collection routes are credential-free, schema-validated, size-capped, with
  per-source admission budgets (`growth_collection_budgets`) and replay
  protection on `eventId`.
- `/_/cron/lifecycle` requires Vercel's cron header; the lifecycle service
  requires `LIFECYCLE_SERVICE_SECRET` on every b4.run path, repeated in route
  middleware on execution paths.
- Svix verification on the Resend webhook; `GROWTH_DATABASE_ENVIRONMENT`
  (`preview | production | test`) must match the `environment` tag.
- `GROWTH_ACTION_TOKEN_*` and `GROWTH_EMAIL_HMAC_*` with active and previous
  key versions. No secret carries a `NEXT_PUBLIC_` prefix.
- `GROWTH_PUBLIC_ACTION_ORIGIN` is a bare HTTPS origin, never derived from a
  request.

## 12. Author's calls (Brian can override while reading)

1. Separate Neon project, as decided by Brian; Resend stays on threadplane's
   account with a second verified domain, also Brian's decision.
2. Postinstall on all ten published packages, assembled from one source.
3. Activation window 30 days; stall windows 3 and 7 days.
4. Projects under `tools/` (`tools/growth`, `tools/lifecycle`, `tools/posthog`),
   since the repo has no `apps/` and `tools/` already holds internal
   infrastructure.
5. Routes under `/_/...` to stay clear of the API reference at `/api`.
6. The threadplane hand-off is one fixed line in step 3 and the
   `marketing:threadplane_cta_click` event; no triggered email.
7. Step 3 may carry two links.
8. `hb:` as the PostHog SDK namespace.
9. The form's "Where are you stuck?" is required, so every submission gives
   Brian something to answer.
10. Only core carries the installation token; the install-to-runtime link is
    per core install, and framework comes from the runtime `integration`
    property.
11. The lifecycle service targets current `@b4run/*`, so PR 5 rebuilds the
    deployable shell rather than copying Dawn 0.8.26's.

## 13. Answered during review

1. `brian@hashbrown.dev` does not exist yet; Brian creates it in Google
   Workspace before the mailbox poller and BCC seed are enabled.
2. `hashbrown.dev/call` redirects to the same Google Calendar appointment page
   threadplane's `/call` uses, through a `redirects()` entry in
   `www/next.config.ts`.
3. Brian supplies personal access tokens and the builder provisions PostHog,
   Vercel (including the Neon marketplace stores), and the Resend domain
   through their APIs before PR 1, so every PR is verified in preview as
   written. Resend is shared with threadplane. Neon is reached only through
   Vercel's marketplace API, as threadplane already does.

## 14. Rollout and PR sequence

Every switch defaults off and accepts only the exact strings `true` or `false`:
`CAMPAIGN_ENABLED`, `CAMPAIGN_ENROLLMENT_ENABLED`, `DELIVERY_ENABLED`,
`LIFECYCLE_CRON_ENABLED`, `GROWTH_OBSERVATION_PROCESSING_ENABLED`,
`GROWTH_INSTALL_DIGEST_ENABLED`, `GROWTH_INSTALL_RUNTIME_HELLO_ENABLED`.

0. **Provisioning.** Scripts under `tools/growth/scripts/provision/`,
   run once with Brian's tokens: four Neon marketplace stores on the Vercel
   team, connected to the www and lifecycle projects per target; PostHog project with the ingest allowlist token;
   `hashbrown.dev` domain on the shared Resend account with DNS records
   reported back for Brian to add; lifecycle Vercel project via
   `tools/vercel/bootstrap.mjs` and the `VERCEL_PROJECT_ID_LIFECYCLE` secret;
   env vars on the www and lifecycle Vercel projects. Output is a checklist of
   what was created, with no secret values.
1. **Growth control plane.** `tools/growth` lib, migrations, Neon preview and
   production, contacts/activity/jobs/stops, tokens, Resend sender and webhook,
   the `/_/unsubscribe`, `/_/growth/stop`, `/_/webhooks/resend` routes. Tests
   for every stop path and the delivery-status precedence.
2. **Observation intake.** Collection routes, observation tables, budgets,
   redaction, projection, facts, funnel views, report commands.
3. **Collectors.** Install collector assembled into the ten packages (with a
   pack-verification test that the published tarball carries `install/` and the
   `postinstall` script, and that the in-repo manifests do not). Core runtime
   collector with the four milestones, React and Angular wiring, READMEs, docs
   page, `/privacy`. Published behind a minor release.
4. **Website analytics.** posthog-js, `/_/ingest`, event contract, dashboards
   as code, nightly quality check, threadplane CTA events.
5. **Lifecycle service.** `tools/lifecycle` on b4.run, third `DEPLOY_TARGETS`
   entry, cron route, dispatcher, fulfillment, notifications, campaign
   templates with the linter, schedule, digest, install-runtime hello, and the
   shared announcements catalog behind the site pill and runtime
   announcements. Preview dogfood against a
   controlled recipient with `DELIVERY_ENABLED=false`, then `true` with the
   non-production allowlist.
6. **Get unstuck form.** Page, route, acknowledgement, enrollment, links from
   docs, footer, READMEs, and the console announcement.
7. **Enable.** Production switches on in the order observation processing,
   delivery, campaign enrollment, campaign, cron, digest, install-runtime hello.

Each PR runs build, test, and lint for every affected project, including the
ten packages for PR 3.

## 15. Left to the builder

- Exact SQL for the stall columns and the 30-day activation window.
- How React and Angular surface `telemetry: false` (prop versus provider option
  shape), as long as it is public, documented, and non-`ɵ`.
- The rollup and ng-packagr steps that copy `install/` and patch the published
  `package.json`, and the pack-verification test.
- Where exactly in the chat runtime each milestone fires, provided no
  conversation content, schema, or identifier is ever read.
- Form styling, which follows the docs site's existing components.
- Dashboard JSON specifics beyond the four named dashboards.
- Apps Script deployment steps, documented in a runbook under
  `docs/superpowers/runbooks/`.
