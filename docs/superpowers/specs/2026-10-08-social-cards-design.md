# Social cards in the LiveLoveApp house style

Date: 2026-10-08
Status: implemented

## Problem

hashbrown.dev shares one static card, `www/public/image/meta/og-default.png`
(and a 1200x600 twin, `twitter-card.png`): the skateboarding hashbrown and
"Build agents that run in the browser". The copy is retired (the site now says
"AI chat and agents for React and Angular"), the illustration is off-brand for
LiveLoveApp's new identity, and every blog post and docs page shares the same
card. GitHub links unfurl with GitHub's generic card because no social preview
is uploaded.

## Decision

Direction A from the brainstorm: LiveLoveApp's `ogCard` layout (white ground,
ink Hanken Grotesk 600, flat, sentence case, no eyebrows, gradients or
illustration), with hashbrown's logo in its own colours and a LiveLoveApp
credit. The site's own look does not change.

### Layout (1200x630)

- Ground `#ffffff`, padding 72px, flex column, `space-between`.
- Top left: hashbrown mark (64px tall) and wordmark (40px tall), 14px apart,
  in their own colours.
- Top right: "by" in Hanken 400, 22px, `#5d5d5d`, then the LiveLoveApp mark
  in ink, 30px tall, 12px gap. Right edge at 72px, centred on the hashbrown
  logo's vertical midline.
- Bottom left: title in Hanken 600, letter-spacing `-0.03em`, max width
  1000px, ink `#0d0d0d`. 64px / line-height 1.08 when the title is 60
  characters or fewer; 52px / 1.1 when longer. Three lines at most at 52px
  (the longest current title, 117 characters, fits).
- Under the title, 24px gap: subtitle lines in Hanken 400, 26px, `#5d5d5d`.

### Surfaces

| Surface | Route | Title | Subtitle |
|---|---|---|---|
| Default (home, blog index, API reference, anything without a card) | `www/src/app/opengraph-image.tsx` | "AI chat and agents for React and Angular." | "Open source generative UI framework · hashbrown.dev" |
| Blog post | `www/src/app/blog/[slug]/opengraph-image.tsx` | Post title | "Oct 8, 2026 · hashbrown blog" (the blog's existing `formatPostDate`) |
| Docs page | `www/src/app/og/docs/[sdk]/[...slug]/route.tsx`, a static route handler: Next rejects `opengraph-image` below a catch-all ("Catch-all must be the last part of the URL", verified on 16.3.6) | Doc title with the `: Hashbrown React Docs` / `: Hashbrown Angular Docs` suffix removed | Doc description (when present, cut at a word to 120 characters), then "React docs · hashbrown.dev" / "Angular docs · hashbrown.dev" |
| GitHub preview, 1280x640 | `www/src/app/github-card/route.tsx` | Default title | "Generative UI, client-side tools and streaming structured output, from any model.", then a pill: `npm install @hashbrownai/react` in JetBrains Mono 24px on `#f7f7f8`, 1px `#e8e8e8` border, fully rounded |

The GitHub card uses 80px vertical and 96px horizontal padding so a 1.905:1
crop (which trims width) never reaches content.

Copy avoids em-dashes, per LiveLoveApp's design rules.

## Structure

`www/src/lib/og/` owns the card kit; every route renders through it.

- `tokens.ts`: colour and size literals (Satori cannot read CSS variables)
  and `titleSize(title)`, the 64/52 step.
- `fonts/`: `HankenGrotesk-Regular.ttf`, `HankenGrotesk-SemiBold.ttf` and
  `OFL.txt` copied from LiveLoveApp's `src/app/og-fonts/`, plus
  `JetBrainsMono-Regular.ttf`. Static instances, not variable fonts.
  Files are read via `repoRoot()` at build time; every card is prerendered.
- `assets.ts`: the font loader, and the hashbrown mark and wordmark (from
  `www/public/image/logo/`) and the LiveLoveApp mark (`lla-mark.svg`, copied
  from LiveLoveApp's `public/brand/`) as SVG data URIs.
- `card.tsx`: `<Card title subtitle={string[]} code? size={'og' | 'github'} />`,
  the one layout, plus `renderCard(...)` returning an `ImageResponse`.
- `copy.ts`: `docsCardTitle(title)` (suffix removal), `truncateAtWord`, and
  the card strings.

The kit and card routes are allowed inline styles (Satori has no stylesheet);
add them to any lint ignore that bans inline styles.

### Rendering

All cards prerender at build time. Blog and docs card routes export
`generateStaticParams` from the same lists their pages use, with
`dynamicParams = false` so an unknown slug is a 404, never an on-demand render. Docs pages set
their `og:image` to `/og/docs/<sdk>/<slug>` explicitly. 92 PNGs (1 default,
11 blog, 79 docs, 1 GitHub) are added to the build output; production deploys already upload one
`--archive=tgz` archive, so the Vercel Hobby file-upload limit is not touched.

### Metadata

- `pageMetadata` no longer injects `DEFAULT_OG_IMAGE`; it passes `images`
  only when a page supplies one. Next 16 only applies a file-based
  `opengraph-image` from a segment's own folder once that segment sets
  `openGraph`, so home and blog posts get theirs from their folders, docs
  pages pass `/og/docs/...`, and the blog index and API pages pass
  `DEFAULT_CARD_IMAGE` (`/opengraph-image`). Blog posts with an `ogImage` in
  front matter keep it (verified: a page's own `images` wins over the file).
- `layout.tsx` drops the hard-coded `twitter.images`; Next falls back to the
  Open Graph image for `twitter:image`. `twitter:card` stays
  `summary_large_image`.
- `og-default.png` and `twitter-card.png` are deleted, along with
  `DEFAULT_OG_IMAGE`, once nothing references them.

### GitHub preview export

`scripts/export-github-card.mjs` fetches `/github-card` (production origin by
default, `--origin http://localhost:3000` for local) and writes
`docs/brand/github-social-preview.png`, which is committed. The maintainer
uploads it once at repository Settings → General → Social preview; GitHub has
no API for this.

## Testing

Top-level `test()` with arrange/act/assert, written before the code:

- `titleSize` returns 64 at 60 characters and 52 at 61.
- `docsCardTitle` strips both SDK suffixes and leaves other titles alone.
- All three font files exist and contain no `fvar` table.
- Every blog slug and every docs `[sdk, slug]` pair has a card param
  (card params equal page params).
- `pageMetadata` without an image emits no `openGraph.images`.

The www e2e route report asserts every card route is in the prerender
manifest and fails if any prerendered page lacks `<meta property="og:image">`. Rendered PNGs are reviewed by
a human before this is called done; tests constrain the card, they do not
certify it.

## Out of scope

- Any change to the site's visual identity.
- Per-symbol cards for the API reference.
- Uploading the GitHub preview (manual, by the maintainer).

## Definition of done

1. Default, blog and docs cards render in the approved layout and are served
   in `og:image` and `twitter:image` on their pages.
2. The old static cards are gone and nothing references them.
3. `docs/brand/github-social-preview.png` is committed and matches
   `/github-card`.
4. `npx nx build www`, `test www`, `lint www` and `e2e www` pass.
5. The rendered PNGs have been reviewed and approved.
