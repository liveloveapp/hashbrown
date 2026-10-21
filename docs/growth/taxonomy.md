# hashbrown.dev event taxonomy

The closed set of PostHog events hashbrown.dev sends. Every name in backticks
below is checked by tests in `tools/posthog`:

- `code-taxonomy.spec.ts` fails when `www` fires or declares an event that is
  not listed here.
- `taxonomy.spec.ts` fails when a committed insight or a contract entry uses an
  event that is not listed here.
- `telemetry-contract.ts` holds the machine-readable version of the property
  columns; `telemetry-contract.spec.ts` checks every insight against it, and
  `npx nx quality:live posthog` checks sampled production events against it.

PostHog measures engagement only. Nothing in PostHog authorizes an email, and
PostHog never receives contact PII: no email, no Git identity, no connection
string, no prompt or message content. Lifecycle facts (installs, activation,
email) live in Neon; see `npx nx report growth`.

## Conventions

- Event names are `namespace:snake_case` (`marketing:` or `docs:`), or a
  PostHog built-in starting with `$`.
- Properties are snake_case.
- `source_page` is always a pathname: never a query string or hash.
- `destination_url` has its query string and hash removed.
- New events are added to `www/src/lib/analytics/events.ts`, this file, and
  `tools/posthog/telemetry-contract.ts` in the same change.

## Forbidden properties

No event may carry any of: `prompt`, `messages`, `threadId`, `runId`,
`apiUrl`, `url`, `error`, `schema`, `toolArgs`, `componentProps`.
`quality:live` also fails on any property name or value shaped like an email
address. It ignores `$*` and `utm_*` properties, click ids (`gclid`, `fbclid`,
and similar), `token`, `uuid` and `distinct_id`.

## PostHog built-ins (posthog-js)

Sent by posthog-js in the browser (`www/instrumentation-client.ts`), through
the `/_/ingest` proxy.

| Event          | When                                                                                                                                                       | Contract properties                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `$pageview`    | Every page load and every App Router soft navigation (`capture_pageview: 'history_change'`).                                                               | allowed: `$pathname`, `title`; breakdown: `$pathname` |
| `$pageleave`   | When a page is left (`capture_pageleave: 'if_capture_pageview'`).                                                                                          | Not in the contract; not charted.                     |
| `$autocapture` | Clicks, form submits and changes (`autocapture: true`). Needs the project-level `autocapture_opt_out: false`, enforced by `npx nx settings:apply posthog`. | Not in the contract; not charted.                     |
| `$web_vitals`  | Core Web Vitals (`capture_performance: { web_vitals: true }`).                                                                                             | Not in the contract; not charted.                     |

## Marketing

| Event                             | When                                                                                                                                                                                                                                                                                                                    | Required            | Also allowed                                                                                | Breakdowns                         | Source                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `marketing:cta_click`             | A tracked call to action is clicked. `cta_id` is a stable id (`hero_quick_start`, `install_copy`, `nav_*`, `copy_*`, …); `surface` is `home`, `nav`, `footer`, `docs`, `blog` or `unstuck`.                                                                                                                             | `cta_id`, `surface` | `destination_url`, `source_section`, `source_page`                                          | `cta_id`, `surface`, `source_page` | `www/src/lib/analytics/client.ts`                                                        |
| `marketing:threadplane_cta_click` | A link from hashbrown.dev to threadplane is clicked. `surface` is `homepage_banner`, `footer`, `docs_platforms`, `blog` or `email`.                                                                                                                                                                                     | `surface`           | `destination_url`, `source_page`                                                            | `surface`, `source_page`           | `www/src/lib/analytics/client.ts`                                                        |
| `marketing:engaged_time`          | Visible time on a pathname crosses 10 s, then 30 s; once per threshold per pathname, restarted on soft navigation. `engaged_seconds` is `10` or `30`.                                                                                                                                                                   | `engaged_seconds`   | `source_page`                                                                               | `engaged_seconds`                  | `www/src/components/site/EngagedTimeSignal.tsx`, `www/src/lib/analytics/engaged-time.ts` |
| `marketing:ai_crawler_visit`      | An AI crawler (GPTBot, ClaudeBot, PerplexityBot, …); `ai_crawler` is the lowercased user-agent token requests a page or an AI-facing file. Sent from Edge middleware, anonymous, no GeoIP; deduplicated per crawler, path and hour and capped at 500 per hour per isolate. `user_agent` is truncated to 200 characters. | `ai_crawler`        | `source_page`, `user_agent`                                                                 | `ai_crawler`                       | `www/src/middleware.ts`, `www/src/lib/analytics/ai-traffic.ts`                           |
| `marketing:ai_referral_visit`     | A visitor arrives from an AI answer engine (ChatGPT, Perplexity, Claude, Gemini, Copilot, You.com), by referrer host; `ai_source` is a slug such as `chatgpt`. Sent from Edge middleware, anonymous.                                                                                                                    | `ai_source`         | `source_page`                                                                               | `ai_source`                        | `www/src/middleware.ts`, `www/src/lib/analytics/ai-traffic.ts`                           |
| `marketing:pre_analytics_exit`    | A visitor leaves before posthog-js has loaded. Sent at most once by the inline beacon, which posthog-js disarms after init. `trigger` is `pagehide` or `visibilitychange`.                                                                                                                                              | –                   | `elapsed_ms`, `trigger`, `source_page`, `referrer_host`, `viewport_width`, `effective_type` | `trigger`                          | `www/src/lib/analytics/pre-analytics-beacon.ts`                                          |
| `marketing:unstuck_form_submit`   | The unstuck form is submitted. Declared; fired once the form ships.                                                                                                                                                                                                                                                     | –                   | `surface`, `source_page`, `error_reason`                                                    | `surface`                          | not fired yet                                                                            |
| `marketing:unstuck_form_success`  | The form submission is accepted. Declared; fired once the form ships.                                                                                                                                                                                                                                                   | –                   | `surface`, `source_page`, `error_reason`                                                    | `surface`                          | not fired yet                                                                            |
| `marketing:unstuck_form_fail`     | The form submission fails; `error_reason` is a short code, never a message. Declared; fired once the form ships.                                                                                                                                                                                                        | –                   | `surface`, `source_page`, `error_reason`                                                    | `surface`                          | not fired yet                                                                            |

## Docs

| Event              | When                                                                                                       | Required                            | Also allowed  | Breakdowns              | Source                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------- | ----------------------- | --------------------------------- |
| `docs:page_viewed` | A `/docs/react/…` or `/docs/angular/…` page is viewed, including soft navigations.                         | `pathname`, `framework`             | `source_page` | `framework`, `pathname` | `www/src/lib/analytics/client.ts` |
| `docs:code_copied` | A docs code block is copied. `language` is the fence language or `unknown`; the code itself is never sent. | `pathname`, `framework`, `language` | `source_page` | `framework`, `language` | `www/src/lib/analytics/client.ts` |

## Dashboards

Dashboards and insights are code in `tools/posthog/dashboards` and
`tools/posthog/insights`; see `tools/posthog/README.md`.

| Dashboard                      | Insights                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Website · Growth overview      | pageviews by path, engaged page views, docs reading by framework, pre-analytics exits by trigger |
| Website · Developer funnel     | pageviews by path, docs reading by framework, code copies by framework, CTA clicks by id         |
| Website · Threadplane hand-off | threadplane hand-off by surface, CTA clicks by id                                                |

The `ai-traffic` insight is synced but on no dashboard.
