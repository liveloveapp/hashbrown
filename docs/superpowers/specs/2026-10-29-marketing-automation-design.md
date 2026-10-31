# Hashbrown marketing automation

Date: 2026-10-29. Status: approved 2026-10-29.

Hashbrown gets a weekly content loop: an agent researches the week, drafts every
post in Brian's voice, Brian reviews and approves it in one Claude Code session,
and a cloud service publishes each post on schedule.

Threadplane already has the publishing half
(`~/repos/angular-agent-framework/marketing/channels`) and a voice guide
(`~/repos/angular-agent-framework/docs/gtm/voice.md`). Where this document says
"port from threadplane", the builder copies that code and adapts names; it does
not redesign it. Threadplane never built the planning, drafting, scheduling or
approval parts, so those are specified here.

## 1. Intent and why

Hashbrown ships often (lately a minor every two weeks and patches every few
days) but almost none of it reaches people. The blog has 14 posts with a
seven-month gap, and nothing goes to X, LinkedIn or dev.to. Brian has the
material and not the time.

The goal is a steady, organic presence that sounds like Brian, costs him one
review session a week, and never posts anything he has not seen.

Cadence targets:

- X: one post a day, from Brian's personal account.
- LinkedIn: two to three posts a week, from Brian's personal profile.
- Blog: one post a week on hashbrown.dev, cross-posted to dev.to with
  `canonical_url` pointing at hashbrown.dev.

Content types, mixed across the week:

- `release`: what shipped, from releases and the changelog.
- `qa`: two to three questions and answers a week, from real questions (GitHub
  issues and discussions, things people ask) where possible. When there are not
  enough real ones, the agent may write the question itself, phrased plainly in
  Brian's voice, and never presented as something a person asked. The answer
  still needs sources.
- `topical`: reacting to relevant news and events.
- `guide`: a small, concrete how-to.
- `take`: a mildly controversial technical opinion.
- `blog_promo`: pointing at this week's blog post.

## 2. Goals, non-goals, anti-goals

### Goals

- Every week has a complete draft (all posts written out, with day and time)
  ready before Brian sits down to review.
- Brian reviews in a Claude Code session. He can see every draft, rewrite,
  swap, kill or regenerate any post, and then say "go ahead" once to schedule
  the whole week. He can also approve or hold single posts.
- Approved posts publish on time from the cloud, with no laptop involved.
- Every published post is recorded, so the agent does not repeat itself and
  Brian can see what went out.
- The blog post lands on hashbrown.dev first, then dev.to with the canonical URL.

### Non-goals

- Analytics dashboards. Phase 4 feeds simple numbers back into planning; that
  is all.
- Replying to comments or DMs, or any engagement automation.
- Other channels (Bluesky, Reddit, HN, Discord, newsletter) for now. The
  adapter registry should make them easy to add later.
- A web UI for review. The review is a Claude Code conversation.

### Anti-goals (failure even if it works)

- **Anything posts without Brian's approval.** Only rows Brian approved are
  publishable, and only in the week he approved.
- **It sounds like AI.** Em dashes, hashtags, hype words, "not X but Y"
  cadence, polished-but-empty lines, invented anecdotes. See section 5.
- **Political or offensive content.** "Mildly controversial" means technical
  opinions only: frameworks, architecture, AI tooling, industry habits. Never
  politics, religion, social issues, identity, or anything that mocks or
  attacks a person or a named individual. Disagreeing with an approach or a
  tool is fine; dunking on people is not.
- **Made-up facts.** Release details, numbers, quotes and links must come from
  the research sources. If the agent cannot cite where a claim came from, the
  claim does not go in the post.
- **Brian's first-person stories are not invented.** The agent may write "I"
  about things the sources show Brian did (merged a PR, shipped a release,
  gave a talk). Anything else is marked for Brian to fill in during review.

## 3. Constraints

- Lives in the hashbrown repo (`~/repos/hashbrown`), Nx workspace.
- The post queue lives in the existing growth Neon database (`DATABASE_URL`)
  as `marketing_*` tables, added as new migrations in
  `tools/growth/migrations/` and applied with the existing runner
  (`tools/growth/scripts/apply-migrations.mts`).
- Runs in the cloud on a cron. Built as a b4run app the same way
  `tools/lifecycle` is: b4run 0.14, Vercel prebuilt deploy through
  `.github/workflows/deploy.yml`, bearer-protected adapter, triggered by a
  Vercel cron route in `www` (see `www/vercel.json` and
  `www/src/app/_/cron/lifecycle/`).
- Posts go to Brian's personal X and LinkedIn accounts.
- LinkedIn personal tokens last 60 days with no refresh. X uses OAuth 2.0 with
  rotating refresh tokens. dev.to uses a static API key.
- X's API charges per post, more for posts with links (about $0.20 per link
  post per `reports/Social card and thumbnail CTR.md`, a gitignored report in
  the main checkout at `~/repos/hashbrown/reports/`). Most X posts carry no
  link.
- LinkedIn reach drops for posts with links; links go in the first comment
  (the threadplane LinkedIn adapter already supports `firstComment`).
- Model: Claude through the Anthropic API (`claude-opus-5-5` for drafting,
  a smaller model is fine for research summarising). Secret: `ANTHROPIC_API_KEY`.

## 4. How it works

```
Saturday (cron)          Sunday/Monday (Brian)          All week (cron, every 15 min)
research -> draft-week   /hashbrown-week in Claude Code  dispatch: publish due approved posts
   writes draft week  ->  review, edit, "go ahead"   ->   X, LinkedIn, blog merge, dev.to
   to Neon                 writes approved rows            records results in Neon
```

### 4.1 Pieces

1. **`tools/marketing`**: a new b4run app, built and deployed like
   `tools/lifecycle` (its own Vercel project, `MARKETING_SERVICE_SECRET`
   bearer, adapter in front of b4run). Workflows:
   - `research` (phase 2): gathers the week's signals into a research brief.
   - `draft-week` (phase 2): turns the brief into a full draft week.
   - `dispatch` (phase 1): leases due, approved posts and publishes them.
2. **Channel adapters**: ported from
   `~/repos/angular-agent-framework/marketing/channels/src` (X, LinkedIn,
   dev.to, validation, dry run, retries, auth CLIs) into
   `tools/marketing/src/channels`. Fix the known threadplane gap: rotated X
   refresh tokens are persisted to Neon (`marketing_channel_credentials`,
   encrypted at rest), not held in memory.
3. **Cron**: a new `www` route `/_/cron/marketing`, every 15 minutes in
   `www/vercel.json`, calling the marketing app's `dispatch` exactly the way
   `/_/cron/lifecycle` calls lifecycle. A weekly entry (Saturday morning)
   triggers `research` then `draft-week` from phase 2.
4. **`/hashbrown-week`**: a Claude Code skill in the hashbrown repo
   (`.claude/skills/hashbrown-week/`) that runs the review. It talks to Neon
   through a local CLI in `tools/marketing/scripts/` using `DATABASE_URL`,
   following the `tools/growth/scripts/growth-control.mts` precedent.
5. **Voice guide**: `docs/marketing/voice.md` in the hashbrown repo, seeded
   from threadplane's `docs/gtm/voice.md` plus the social rules in section 5.
   Both the drafting workflow and the review skill load it.
6. **Blog support on hashbrown.dev**: an RSS feed (`/blog/rss.xml`) and the
   publish flow in 4.4.

### 4.2 Data (growth Neon database)

Table names use the `marketing_` prefix, matching the `growth_` convention.

- `marketing_weeks`: `id`, `week_start` (date, Monday), `status`
  (`drafting | draft | approved | done`), `research_brief` (jsonb, with sources),
  `approved_at`, timestamps.
- `marketing_posts`: `id`, `week_id`, `channel` (`x | linkedin | blog | devto`),
  `kind` (section 1 types), `scheduled_at` (timestamptz), `draft` (jsonb, the
  threadplane `Draft` shape), `sources` (jsonb: URLs and facts the post relies
  on), `depends_on` (nullable post id, e.g. dev.to depends on blog),
  `status` (`draft | approved | held | publishing | published | failed | cancelled`),
  `attempts`, `lease_until`, `external_id`, `external_url`, `published_at`,
  `last_error`, timestamps.
- `marketing_channel_credentials`: per channel token material and expiry.
- `marketing_signals` (phase 3): ingested items with source, URL, title,
  summary, score, `seen_at`, `used_in_post_id`.

`dispatch` uses leasing (`lease_until`) so overlapping cron ticks never
double-post. A post is publishable only when `status = approved`, `scheduled_at <= now()`,
and any `depends_on` post is `published`. Approval is per post: "go ahead"
approves every non-held post in the week at once, and approving a single post
makes just that post publishable. The week's `approved` status is bookkeeping,
not a second gate.
Failures retry with backoff up to a small limit, then go to `failed` and show
up in the next review (and as an operator alert, reusing the lifecycle alert
path if cheap).

### 4.3 The review session (`/hashbrown-week`)

1. Loads the next week's draft from Neon (phase 1: drafts it in-session; see
   phases). Also shows last week's results: what published, what failed, and
   any credential expiring within 14 days (the LinkedIn token).
2. Shows the week as a day-by-day list: day, time, channel, type, full text,
   and the sources behind it. The blog post is shown in full.
3. Brian talks it through. The skill edits rows in Neon as he goes: rewrite,
   swap, move, kill, regenerate, hold.
4. Every draft is run through the voice check (section 5) after each edit.
5. On "go ahead", all non-held posts become `approved` and the week becomes
   `approved`. Single-post approval also works ("approve Tuesday's X post").
6. The skill opens the blog post PR (section 4.4) and reports the schedule.

### 4.4 Blog and dev.to

- The blog post is written as a normal hashbrown.dev post:
  `www/content/blog/YYYY-MM-DD-slug.md`, dated with its publish day.
- During review approval, the skill opens a PR with the post. Brian can review
  it on GitHub like any other.
- **Amended 2026-10-31: Brian merges, the site gates.** The marketing service
  no longer merges the PR and holds no GitHub token. The post's frontmatter
  carries `published: true` and `publishAt` (the blog row's `scheduled_at`);
  the site leaves out any post that is not published or whose `publishAt` is
  in the future, so Brian can merge the PR any time before the slot. The blog
  pages are static, so the scheduled `Blog Publish` workflow
  (`.github/workflows/blog-publish.yml`) redeploys www when a post comes due
  and still answers 404.
- From `scheduled_at`, `dispatch` waits for the canonical URL to return 200,
  then marks the blog post `published`, which unblocks the dev.to post. If the
  URL is not live within 2 hours (the PR is not merged, or its `publishAt` is
  later than the slot, or the deploy failed), the blog post and everything
  depending on it go to `held` and show up in the next review and as an
  operator alert; nothing publishes late on its own. dev.to reads the merged
  markdown from `main` on raw.githubusercontent.com (the repo is public). The dev.to post uses the dev.to adapter
  with `canonical_url` set to the hashbrown.dev URL. The threadplane adapter
  sends the body unchanged, so the markdown conversion is new work: make
  relative links and image paths absolute, and turn any site-only syntax into
  plain markdown.
- The RSS feed is for readers and for the liveloveapp writing feed. dev.to's
  own RSS import stays off, so each post reaches dev.to once, through the API.
- The `blog_promo` X and LinkedIn posts also depend on the blog post.

### 4.5 Weekly schedule (defaults, configurable)

Timezone default `America/New_York`.

- Saturday 08:00: `research`, then `draft-week` (phase 2 onward).
- Review: whenever Brian runs `/hashbrown-week`, normally Sunday or Monday.
- X: daily at about 10:00 on weekdays, 11:00 on weekends.
- LinkedIn: Tuesday and Thursday 08:30, optional Wednesday.
- Blog: Wednesday 10:00; dev.to follows once live; promos the same day.

Suggested weekly mix (the drafter adapts to what actually happened): one
release post if anything shipped, two to three Q&A, one or two topical, one or
two guides, one take, one blog promo per channel.

## 5. Voice

The voice source is Brian's posts from 2024 and older in
`~/repos/brianflove/src/content/posts/` (141 posts, 2012 to 2024).
`docs/marketing/voice.md` carries the rules and 10 to 20 verbatim excerpts as
few-shot examples. Summary of what it must say:

- Short declarative sentences, often one per line. First person. Contractions.
- Plain text, minimal punctuation. No em dashes (use a period or " - "). No
  hashtags. No emoji, or at most one, rarely. No bold-label bullets. No
  numbered thread hooks.
- His words: "Let's", "simply", "pretty", "really", "check out", "Well,", "Ok,",
  "Of course". First / Next / Then for anything stepwise. Opinions owned with
  "I think" or "I would say".
- Never: delve, leverage, seamless, robust, unlock, elevate, landscape,
  game-changer, supercharge, "the future of", "In today's...", "Here's the
  thing", "Let that sink in", "not X but Y", "it's not just X", "I'm thrilled
  to announce", triplets for rhythm, colon reveals.
- Always name the specific thing: the package, the version, the number, the API.
- X shape: what he did or found, one concrete detail, a plain verdict or a real
  question.
- LinkedIn shape: one reflective opener, three to six single-line sentences,
  an honest admission where there is one, a short invite or question at the end.
  Link in the first comment.
- Typos: occasional and natural, roughly one small slip in a few posts a week
  (a doubled word, a dropped letter, lowercase start). Never in names, package
  names, code, versions or URLs. The drafter adds them; the review shows them so
  Brian can keep or fix them.

A deterministic voice check runs on every draft (in `draft-week` and after
every edit in review): banned words and phrases, em dashes, hashtags, emoji
count, channel length limits (reusing the threadplane validation), link rules
per channel, and "sources present". It reports problems; it does not silently
rewrite.

## 6. Phases

**Phase 1: publish what Brian approves.** The cloud half and a working weekly
loop, with drafting done in the review session.

- `marketing_*` migrations; `tools/marketing` app with `dispatch`; adapters
  ported, with X token persistence; auth CLIs; dry-run mode end to end.
- `/_/cron/marketing` in `www`; deploy wiring.
- RSS feed on hashbrown.dev.
- `docs/marketing/voice.md` and the voice check.
- `/hashbrown-week` v1: Claude Code researches the week itself (repo activity
  via `gh` and git, `CHANGELOG.md`, npm releases, recent blog posts, web
  search), drafts the week into Neon, runs the review, approves.
- Done when: one real week is drafted, reviewed, approved, and published on
  schedule to X, LinkedIn, hashbrown.dev and dev.to with no manual posting.

**Phase 2: draft in the cloud.** Move research and drafting into the
`research` and `draft-week` workflows on the Saturday cron, so the draft is
waiting. `/hashbrown-week` v2 loads it instead of drafting. Done when Brian
opens the session and the week is already there.

**Phase 3: relevant-content ingestion.** Designed with Brian in its own
session. Starting point: a source list (release feeds and changelogs of
adjacent projects such as AG-UI, Angular, React, model providers; selected
blogs and newsletters; Hacker News and Reddit searches; X and web search for
generative UI and agent UI topics), stored as `marketing_signals`, scored for
relevance, deduped, and fed into `research`. Also where Q&A questions get
sourced from GitHub issues and discussions systematically.

**Phase 4: learn from results.** Pull what metrics each platform allows
(dev.to is available; X and LinkedIn metrics need higher API tiers or
permissions, so may stay manual) and show last week's results in the review so
planning can lean on what worked.

## 7. Secrets (names only)

`DATABASE_URL` (growth Neon), `B4_DATABASE_URL` (b4 state), `MARKETING_SERVICE_SECRET`,
`CRON_SECRET` (existing), `ANTHROPIC_API_KEY`, `X_CLIENT_ID`, `X_CLIENT_SECRET`,
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_AUTHOR_URN`,
`DEVTO_API_KEY`, `MARKETING_CREDENTIALS_KEY` (encrypts
stored tokens). X and LinkedIn access and refresh tokens live in
`marketing_channel_credentials`, written by the auth CLIs.

## 8. Calls made without Brian (check these)

- Separate `tools/marketing` app and Vercel project rather than adding
  workflows to `tools/lifecycle`.
- Phase 1 drafts inside the review session; cloud drafting comes in phase 2.
- Blog publishing by merging a PR at the scheduled time, rather than a
  `publishAt` field plus scheduled redeploys.
- The review skill talks to Neon through a local CLI, not through an HTTP API
  on the marketing app.
- Schedule and timezone defaults in 4.5.
- Approval is per post; the week status is not a second gate.
- Blog PRs get their branch updated about two hours before merge; no admin
  bypass. A deploy that is not live within 24 hours holds the blog post and its
  dependents.
- Agent-written Q&A questions are allowed when framed honestly.
- dev.to RSS import stays off; the API is the only path to dev.to.
- Images: phase 1 is text only. Blog posts use the site's generated share card
  (`www/src/app/blog/[slug]/opengraph-image.tsx`). Generated cards for promo
  posts, using threadplane's `marketing/assets`, can come later.
- Developer apps: hashbrown reuses the X and LinkedIn developer apps threadplane
  set up for Brian's personal accounts, with its own stored tokens. Threadplane
  only posts by hand today; if it ever automates posting to the same accounts,
  the two need to coordinate so Brian does not double-post.
- Typo frequency in section 5.

## 9. Left to the builder

Table column details, the CLI's command shape, retry limits and backoff,
how the skill presents the week, test strategy (follow `tools/lifecycle`),
prompt wording for drafting, and how the voice excerpts are chosen.
