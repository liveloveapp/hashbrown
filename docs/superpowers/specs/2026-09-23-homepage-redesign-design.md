# Homepage redesign

Date: 2026-09-23
Status: approved in brainstorming, pending spec review

## Goal

Tell the ideal visitor what Hashbrown is and get them to install it.

The ideal visitor is a TypeScript developer who wants to add AI chat or agents to a React or Angular web app. Secondary goals:

1. Upsell threadplane.ai to Hashbrown users and to people comparing Hashbrown with competitors.
2. Cross-promote b4.run and pretable.ai without competing with the install.

## Positioning

- **Hashbrown is headless.** It gives you primitives: generative UI from your own components, tools that run in the browser, Skillet structured output, streaming, and any model.
- **threadplane is headful.** It is the finished agent UI for React and Angular: chat, durable threads, approvals, tool progress, and generative UI. Enterprise support is available. It is also free and MIT.
- The upsell is the seam between the two, not a paid tier. Nothing on the site asks for contact details or sells services.
- Do not claim Hashbrown is the only Angular option. CopilotKit, the AI SDK, and LangChain all ship Angular packages now. The claim that holds is "React and Angular, same API."

This spec assumes threadplane supports React by the time this ships. Its React support is in progress.

## Research summary

Competitor homepages converge on one pattern: a short benefit headline, a copyable install command as the primary CTA, a "copy a prompt for your coding agent" option, and real code near the top. The sites that do this:

- AI SDK
- assistant-ui
- Tambo
- Bun
- Astro
- Convex
- Better Auth

The current homepage has no install command, no code, and 13 flat feature cards. Its video section was last updated in September 2025. Analytics records page views only.

## Page structure

Top to bottom:

### 1. Header

- Logo, then links: Docs, API, Example, Blog.
- GitHub star button, followed by a new primary **Quick start** button.
- The Quick start button goes to `/docs/{sdk}/start/quick`.
- Remove the commented-out workshops menu.

### 2. Hero, two columns

**Left column**

- **Headline:** "AI chat and agents for your React or Angular app"
- **Subhead:** "Hashbrown is a headless TypeScript framework. Let the model render your own components, run tools in the browser, and stream typed output from any model."
- **Framework tabs:** React and Angular. The selection is stored in the existing `ConfigService` sdk preference. It switches the install command, the code sample, and the Quick start link.
- **Install command** with a copy button:
  - React: `npm i @hashbrownai/{core,react,openai}`
  - Angular: `npm i @hashbrownai/{core,angular,openai}`
- **Buttons:** primary **Quick start →**, secondary **Copy prompt for your coding agent**.
  - The prompt tells an agent to add Hashbrown to this React or Angular app using `https://hashbrown.dev/llms.txt`.
  - Its exact text lives in one constant, one version per framework.
- **Proof line:** GitHub stars · MIT licensed · provider list.

**Right column**

- A UI kit code sample, followed by a static mock of the chat output it produces: a user message, then `<InvoiceCard>` streaming in.
- React sample: `useUiKit({ components: [exposeComponent(InvoiceCard, …), exposeComponent(AgingChart, …)] })` passed to `useUiChat({ system, components: [invoiceKit] })`.
- Angular sample: `createUiKit(...)` passed to `uiChatResource(...)`.
- Both samples must match the API in `www/analog/src/app/pages/docs/{react,angular}/recipes/ui-kits.md`.

### 3. Works with

One row of providers:

- OpenAI
- Anthropic
- Gemini
- Bedrock
- Azure
- Ollama
- Chrome/Edge local models

Reuse the existing provider logos in `components/home/providers/`, and add any that are missing.

### 4. How it works

Three steps, with short snippets for the selected framework:

1. **Expose your components.** The model can only render what you register, with props validated by Skillet.
2. **Give it tools.** Tools run in the browser, with your app's state and services.
3. **Render the stream.** UI renders as it streams in.

### 5. Everything you need to build it

The 13 feature cards become 6 groups. Each group has a one-line description and an accent line explaining why to pick Hashbrown.

| Group | Accent line |
|---|---|
| Generative UI (includes UI kits) | Only your components, never arbitrary HTML |
| Client-side tools (includes MCP) | Runs in the browser, not just on a server |
| Structured output (Skillet) | A schema language built for LLMs and streaming |
| Streaming everywhere (includes Magic Text) | Incremental parser, low latency |
| Any model (includes local models) | Swap providers without rewriting UI |
| Safe code execution (JS runtime) | Charts and transforms without eval |

- Each group links to its docs page for the selected framework.
- Drop the preview-only features from the homepage: speech and image/document analysis.

### 6. See it in a real app

- A card for the invoicing example with a real screenshot of `invoicing.hashbrown.dev`.
- Copy: "An invoicing assistant that reads the ledger, explains balances, and renders tables and charts from your components. Data is simulated."
- A "built with" row of three tiles:
  - **hashbrown**, Generative UI: chat, tools, streamed components.
  - **b4.run ↗**, Agent backend: TypeScript agents on LangGraph.js.
  - **pretable.ai ↗**, Data grid: fast React grid for streaming data.
- Buttons: **Try the app ↗** (`https://invoicing.hashbrown.dev`) and **Read the source** (GitHub `examples/invoicing`).
- Fix the current bug where the example card says "Build with Angular" and links to Angular docs for a React example.

### 7. threadplane banner

Styled like a YouTube thumbnail: pain first, then trust. It uses threadplane's brand, not Hashbrown's.

- **Background:** navy radial gradient, `#15253E` base.
- **Eyebrow:** the threadplane paper-plane mark, then "THREADPLANE".
- **Headline:** "YOUR CHAT UI" in white, then "ISN'T DONE." in coral `#FF6B4A`. Heavy uppercase.
- **Subhead:** "Threads, approvals, tool progress, retries. threadplane is the whole agent UI for React and Angular, free and MIT, with enterprise support from the team that built both."
- **Single CTA:** "Explore threadplane →" in yellow `#FFAF00`. Link: `https://threadplane.ai/?utm_source=hashbrown&utm_medium=homepage&utm_campaign=headful_banner`.
- **No** "Talk to an engineer", no tiers, no contact form.
- **Photo:** Brian's skeptical pose (BL-003) with the retouched jacket.
  - Source: `~/Pictures/headshot-pilot-production-kit/portraits/BL-003_skeptical-thinking_lettering-cleaned_v01.png`.
  - Trim the transparent space above the head.
  - Export as optimized WebP/PNG with alpha to `www/analog/public/image/landing-page/threadplane/brian-skeptical.webp`, about 900px tall.
  - Anchor to the banner's right and bottom edges so the source's cropped shoulder runs off the edge. Never let the clipped shoulder float inside the banner.
  - Alt text: "Brian Love".
- **Mobile:** stack the text over a smaller photo anchored bottom-right. The headline stays at least 28px.

### 8. From the blog

- The 3 newest blog posts, read from `src/content/blog` with `injectContentFiles`. This replaces the hand-maintained video playlist, so the section cannot go stale.

### 9. Closing CTA

- Headline: "Start building in five minutes."
- The same framework tabs and install command as the hero.
- Buttons: **Quick start →** and **Star on GitHub**.
- A small Hashbrown brand mark as the accent.

### 10. Footer

Four columns:

| Column | Links |
|---|---|
| Docs | Quick start, API reference, Example, llms.txt, llms-full.txt |
| Learn | Blog |
| More from the team | threadplane.ai, b4.run, pretable.ai |
| Community | GitHub, LinkedIn |

- Keep "© LiveLoveApp, LLC {year}" as plain text with no link.
- Keep "Built with AnalogJS".

## Visual direction

Evolve today's brand, don't replace it:

- Keep the ivory background, the fabric texture, the existing color tokens, the squircles, and the yellow/brown palette.
- Body text stays **Fredoka**. Code stays **JetBrains Mono**.
- **Headings switch to Inter Tight**, weights 700 and 800, with tight tracking, loaded from Google Fonts. This applies to homepage headings and the shared header and footer.
- Code panels are light: white with a yellow border.
- Hashy is no longer the hero visual.

## Removals

### Homepage sections and components

- Delete `Hero`, `Samples`, `OpenSource`, `Features` + `Feature`, and `Media`, and replace them with the new sections.
- Delete components that are unused today: `GettingStarted`, `TheVisual`, `Adapters`.
- Delete `hashy-skates/*` if nothing else uses it.
- Remove the dead demo-video code from the old hero.

### Workshops (never happened)

- Pages: `pages/workshops.page.ts`, `pages/workshops/index.page.ts`, `pages/workshops/[slug].page.ts`.
- `src/content/workshops/*`, `models/workshop.models.ts`, `components/CoursesMenu.ts`, `components/Products.ts`.
- The header menu and footer links.
- Workshop references in `pages/blog/[slug].page.ts` and in blog posts.
- Images used only by workshops: `public/image/product/workshop/*`.
- Regenerate `llms.txt` / `llms-full.txt` so they drop workshop content.

### Bluesky

- The footer link and `icons/BrandBlueSky.ts`.

### LiveLoveApp links and CTAs

- The OpenSource section, `LiveLoveAppButton.ts`, `icons/BrandLiveLoveApp*.ts`, and links to liveloveapp.com.
- **Keep** every `github.com/liveloveapp/hashbrown` URL. That is the repository's real address.
- **Keep** the plain-text copyright line.

### Lead generation

- Delete `pages/contact-us/*` and `services/FirebaseService.ts`.
- Remove the `firebase` dependency from `www/analog/package.json` and the root `package.json`, then update the lockfile. If anything else imports Firebase, stop and ask.
- Remove the footer "Contact sales" link and the `hello@liveloveapp.com` link.
- Rewrite the enterprise line in `pages/docs/{react,angular}/start/platforms.md`: point to a GitHub issue for new platforms, plus a threadplane mention for teams that want a headful agent UI and support.

### Announcement toast

- Remove the fixed v0.5 announcement toast (`components/Announcement.ts` and its mount in `app.component.ts`). It points at an old release, and the new hero carries the call to action.

## Analytics

Add Fathom events. Fathom is already loaded.

| Event | Fired when |
|---|---|
| `install-copied` | The install command is copied. Include the framework in the event name, e.g. `install-copied-react`. |
| `prompt-copied` | The agent prompt is copied. Include the framework in the event name. |
| `quick-start-clicked` | The Quick start button is clicked. |
| `threadplane-banner-clicked` | The threadplane banner CTA is clicked. |
| `invoicing-demo-clicked` | The invoicing example link is clicked. |

- Wrap the calls in a small `AnalyticsService` that no-ops when `window.fathom` is missing, including during SSR.
- Add no new analytics dependency.

## Components

New homepage components go in `www/analog/src/app/components/home/`. Each is standalone, uses signals and `input()`, and sets `ChangeDetectionStrategy` consistently with its neighbors.

| Component | Purpose |
|---|---|
| `HomeHero` | Text, tabs, install, and a code/result panel |
| `InstallCommand` | Tabs, command, copy, and event. Reused by the hero and the closing CTA. |
| `WorksWith` | Provider row |
| `HowItWorks` | Three steps |
| `Capabilities` | Six groups |
| `RealApp` | Invoicing showcase and built-with tiles |
| `ThreadplaneBanner` | The threadplane banner |
| `LatestPosts` | Three newest blog posts |
| `ClosingCta` | Closing install CTA |

Code samples are plain string constants, one per framework, highlighted the same way the docs highlight code.

## Testing and verification

- Unit tests for `InstallCommand`: the command switches per framework, copying calls the clipboard and fires the event, and nothing breaks without Fathom.
- Unit tests for `LatestPosts`: sorts newest first and limits to 3.
- Unit tests for `AnalyticsService`: no-ops without Fathom.
- `npx nx build www`, `npx nx test www`, and `npx nx lint www` all pass.
- `npx nx e2e www` passes. Update any e2e assertion that targeted the old hero.
- Manual check in the browser pane at desktop and 375px width:
  - No horizontal scroll.
  - The banner photo stays anchored.
  - The framework toggle updates everything.
- A search for workshop, Bluesky, liveloveapp.com, contact-us, and Firebase under `www/` finds nothing, apart from the GitHub repo URLs and the copyright text.

## Out of scope

- Changing heading fonts on docs, blog, or API pages beyond the shared header and footer. That is a possible follow-up.
- A live, model-backed demo on the homepage.
- npm weekly-download counts.
- Changes to threadplane.ai itself. The React support is assumed to exist.
