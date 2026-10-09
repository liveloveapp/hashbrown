# Social Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hashbrown.dev's static mascot share card with generated cards in LiveLoveApp's house style: a default card, one per blog post, one per docs page, and a 1280x640 GitHub preview.

**Architecture:** A small card kit in `www/src/lib/og/` (tokens, copy helpers, asset loaders, one `Card` layout) renders through `next/og` `ImageResponse`. Every card is prerendered at build time: the default and blog cards use Next's `opengraph-image.tsx` convention; docs cards use a static route handler at `/og/docs/[sdk]/[...slug]` because Next rejects `opengraph-image` below a catch-all (verified: "Catch-all must be the last part of the URL"). The GitHub card is a static route exported to a committed PNG.

**Tech Stack:** Next 16.3 App Router, `next/og` (Satori + resvg, bundled with Next, no new dependency), Vitest, Nx.

**Spec:** `docs/superpowers/specs/2026-10-08-social-cards-design.md`

## Conventions for every task

- Tests are top-level `test(...)` with arrange / act / assert separated by blank lines. No `describe`/`it`.
- Run a single spec with `npx vitest run --config www/vitest.config.mts <path>` from the repo root. The full suite is `npx nx test www`.
- New exported functions get a TSDoc `/** ... */` block.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Card assets are read with `repoRoot()` (`www/src/lib/repo-root.ts`), which walks up to `nx.json`. That works for `next build` (cwd `www`) and Vitest (cwd repo root). Every card is prerendered, so nothing reads these files at request time.

## File map

| File | Responsibility |
|---|---|
| `www/src/lib/og/tokens.ts` | Colours, card sizes, `titleSize()` |
| `www/src/lib/og/copy.ts` | Card strings, `docsCardTitle()`, `truncateAtWord()` |
| `www/src/lib/og/assets.ts` | Font loader and SVG data URIs |
| `www/src/lib/og/card.tsx` | `Card` layout and `renderCard()` |
| `www/src/lib/og/fonts/*` | Hanken Grotesk 400/600, JetBrains Mono 400, licences |
| `www/src/lib/og/lla-mark.svg` | LiveLoveApp mark (ink) |
| `www/src/app/opengraph-image.tsx` | Default card |
| `www/src/app/blog/[slug]/opengraph-image.tsx` | Blog post cards |
| `www/src/app/og/docs/[sdk]/[...slug]/route.tsx` | Docs cards |
| `www/src/app/github-card/route.tsx` | GitHub preview |
| `scripts/export-github-card.mjs` | Writes `docs/brand/github-social-preview.png` |
| `www/src/lib/site-metadata.ts`, `www/src/app/layout.tsx`, `www/src/app/docs/[sdk]/[...slug]/page.tsx` | Metadata wiring |
| `www/src/tools/route-report.ts` | e2e: every card is prerendered |
| `www/test/og/*.spec.ts(x)` | Tests |

---

### Task 1: Fonts and brand assets

**Files:**
- Create: `www/src/lib/og/fonts/HankenGrotesk-Regular.ttf`, `HankenGrotesk-SemiBold.ttf`, `OFL.txt`, `JetBrainsMono-Regular.ttf`, `README.md`
- Create: `www/src/lib/og/lla-mark.svg`
- Create: `www/src/lib/og/assets.ts`
- Test: `www/test/og/assets.spec.ts`

- [ ] **Step 1: Copy Hanken Grotesk and the LiveLoveApp mark from LiveLoveApp's `origin/main`**

LiveLoveApp's local `main` is stale; read from `origin/main` without touching that checkout.

```bash
mkdir -p www/src/lib/og/fonts
for f in HankenGrotesk-Regular.ttf HankenGrotesk-SemiBold.ttf OFL.txt; do
  git -C ~/repos/liveloveapp show "origin/main:src/app/og-fonts/$f" > "www/src/lib/og/fonts/$f"
done
git -C ~/repos/liveloveapp show origin/main:public/brand/lla-mark.svg > www/src/lib/og/lla-mark.svg
```

- [ ] **Step 2: Instance JetBrains Mono to a static 400**

Satori cannot parse variable fonts. The machine has the OFL variable font from Google Fonts; fontTools 4.62 is installed.

```bash
fonttools varLib.instancer ~/Library/Fonts/JetBrainsMono-VariableFont_wght.ttf wght=400 --static -o www/src/lib/og/fonts/JetBrainsMono-Regular.ttf
```

Expected: the file is written, about 200-300KB. (JetBrains Mono is also SIL OFL 1.1; `OFL.txt` covers the licence family, and the README names both.)

- [ ] **Step 3: Write the fonts README**

`www/src/lib/og/fonts/README.md`:

```markdown
Fonts for the social cards, read by `../assets.ts` and handed to Satori.

- Hanken Grotesk Regular (400) and SemiBold (600): static instances of
  github.com/google/fonts/tree/main/ofl/hankengrotesk, copied from
  LiveLoveApp's `src/app/og-fonts`.
- JetBrains Mono Regular (400): instanced from the Google Fonts variable font
  with `fonttools varLib.instancer <font> wght=400 --static`.

All are SIL OFL 1.1 (see OFL.txt). Satori cannot read variable fonts, so every
file here must be a static instance.
```

- [ ] **Step 4: Write the failing test**

`www/test/og/assets.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { loadCardFonts, svgDataUri } from '../../src/lib/og/assets';

/** Table tags from a TrueType table directory. */
function tableTags(data: ArrayBuffer): string[] {
  const view = new DataView(data);
  const numTables = view.getUint16(4);
  return Array.from({ length: numTables }, (_, i) =>
    String.fromCharCode(
      ...new Uint8Array(data, 12 + i * 16, 4),
    ),
  );
}

test('loads the three card faces as static fonts', async () => {
  const fonts = await loadCardFonts();

  expect(fonts.map(({ name, weight }) => `${name} ${weight}`)).toEqual([
    'Hanken Grotesk 400',
    'Hanken Grotesk 600',
    'JetBrains Mono 400',
  ]);
  for (const font of fonts) {
    expect(tableTags(font.data)).not.toContain('fvar');
  }
});

test('embeds the logos as SVG data URIs', () => {
  const uri = svgDataUri('lla-mark');

  expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  expect(Buffer.from(uri.split(',')[1], 'base64').toString()).toContain(
    'viewBox="0 0 320 120"',
  );
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/assets.spec.ts`
Expected: FAIL, cannot resolve `../../src/lib/og/assets`.

- [ ] **Step 6: Implement `assets.ts`**

`www/src/lib/og/assets.ts`:

```ts
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '../repo-root';

/** A font face in the shape `ImageResponse` takes. */
export interface CardFont {
  name: 'Hanken Grotesk' | 'JetBrains Mono';
  data: ArrayBuffer;
  weight: 400 | 600;
  style: 'normal';
}

/** The logos a card can show. */
export type CardLogo = 'hashbrown-mark' | 'hashbrown-wordmark' | 'lla-mark';

const LOGO_FILES: Record<CardLogo, string> = {
  'hashbrown-mark': 'www/public/image/logo/brand-mark.svg',
  'hashbrown-wordmark': 'www/public/image/logo/word-mark.svg',
  'lla-mark': 'www/src/lib/og/lla-mark.svg',
};

async function readFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(repoRoot(), 'www/src/lib/og/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Read the card faces: Hanken Grotesk 400 and 600 for text, JetBrains Mono 400
 * for code. Cards are prerendered, so this runs at build time only.
 */
export async function loadCardFonts(): Promise<CardFont[]> {
  const [regular, semibold, mono] = await Promise.all([
    readFont('HankenGrotesk-Regular.ttf'),
    readFont('HankenGrotesk-SemiBold.ttf'),
    readFont('JetBrainsMono-Regular.ttf'),
  ]);
  return [
    { name: 'Hanken Grotesk', data: regular, weight: 400, style: 'normal' },
    { name: 'Hanken Grotesk', data: semibold, weight: 600, style: 'normal' },
    { name: 'JetBrains Mono', data: mono, weight: 400, style: 'normal' },
  ];
}

/**
 * A logo as a base64 SVG data URI, which Satori renders in an `<img>`.
 *
 * @param logo - Which logo to embed.
 */
export function svgDataUri(logo: CardLogo): string {
  const svg = readFileSync(join(repoRoot(), LOGO_FILES[logo]));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}
```

- [ ] **Step 7: Run the test and see it pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/assets.spec.ts`
Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add www/src/lib/og www/test/og/assets.spec.ts
git commit -m "feat(www): social card fonts and logos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tokens and copy

**Files:**
- Create: `www/src/lib/og/tokens.ts`, `www/src/lib/og/copy.ts`
- Test: `www/test/og/copy.spec.ts`

- [ ] **Step 1: Write the failing tests**

`www/test/og/copy.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { docsCardTitle, truncateAtWord } from '../../src/lib/og/copy';
import { titleSize } from '../../src/lib/og/tokens';

test('titles up to 60 characters set at 64px', () => {
  const title = 'x'.repeat(60);

  const size = titleSize(title);

  expect(size).toEqual({ fontSize: 64, lineHeight: 1.08 });
});

test('longer titles step down to 52px', () => {
  const title = 'x'.repeat(61);

  const size = titleSize(title);

  expect(size).toEqual({ fontSize: 52, lineHeight: 1.1 });
});

test('drops the SDK suffix from docs titles', () => {
  const titles = [
    'Structured Output: Hashbrown React Docs',
    'Structured Output: Hashbrown Angular Docs',
    'Magic Text in React: Streaming Markdown',
  ];

  const cardTitles = titles.map(docsCardTitle);

  expect(cardTitles).toEqual([
    'Structured Output',
    'Structured Output',
    'Magic Text in React: Streaming Markdown',
  ]);
});

test('truncates long text at a word boundary with an ellipsis', () => {
  const text = 'one two three four five';

  const short = truncateAtWord(text, 12);

  expect(short).toBe('one two…');
  expect(truncateAtWord('short', 12)).toBe('short');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/copy.spec.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `tokens.ts`**

```ts
/**
 * Card literals from LiveLoveApp's house style (its `src/lib/og.tsx` and
 * `globals.css`). Satori cannot read CSS variables, so they are copied here.
 */
export const CARD_COLORS = {
  ground: '#ffffff',
  ink: '#0d0d0d',
  muted: '#5d5d5d',
  surface: '#f7f7f8',
  rule: '#e8e8e8',
} as const;

/** The 1.905:1 Open Graph card most platforms unfurl. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** GitHub's documented social preview size. */
export const GITHUB_SIZE = { width: 1280, height: 640 } as const;

/**
 * The title's type size: 64px up to 60 characters, 52px beyond, so the
 * longest titles still fit in three lines.
 *
 * @param title - The card title.
 */
export function titleSize(title: string): { fontSize: number; lineHeight: number } {
  return title.length <= 60
    ? { fontSize: 64, lineHeight: 1.08 }
    : { fontSize: 52, lineHeight: 1.1 };
}
```

- [ ] **Step 4: Implement `copy.ts`**

```ts
/** The site's tagline, the default card's title. */
export const CARD_TAGLINE = 'AI chat and agents for React and Angular.';

/** The default card's subtitle. */
export const CARD_DEFAULT_SUBTITLE =
  'Open source generative UI framework · hashbrown.dev';

/** The GitHub card's subtitle. */
export const CARD_GITHUB_SUBTITLE =
  'Generative UI, client-side tools and streaming structured output, from any model.';

/** The install command on the GitHub card. */
export const CARD_INSTALL = 'npm install @hashbrownai/react';

/**
 * A docs page's card title: its front matter title without the
 * `: Hashbrown React Docs` / `: Hashbrown Angular Docs` suffix.
 *
 * @param title - The page's front matter title.
 */
export function docsCardTitle(title: string): string {
  return title.replace(/: Hashbrown (React|Angular) Docs$/, '');
}

/**
 * Shorten text to at most `max` characters, cutting at a word boundary and
 * ending with an ellipsis. Text that already fits is returned unchanged.
 *
 * @param text - The text to shorten.
 * @param max - The longest result allowed, ellipsis included.
 */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/copy.spec.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add www/src/lib/og/tokens.ts www/src/lib/og/copy.ts www/test/og/copy.spec.ts
git commit -m "feat(www): social card tokens and copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The card layout

**Files:**
- Create: `www/src/lib/og/card.tsx`
- Test: `www/test/og/card.spec.tsx`

- [ ] **Step 1: Write the failing test**

`www/test/og/card.spec.tsx` (reads width and height from the PNG IHDR chunk, bytes 16-23):

```tsx
import { expect, test } from 'vitest';
import { renderCard } from '../../src/lib/og/card';

async function pngSize(response: Response) {
  const view = new DataView(await response.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('renders a 1200x630 PNG card', async () => {
  const card = { title: 'Structured Output', subtitle: ['React docs · hashbrown.dev'] };

  const response = await renderCard(card);

  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await pngSize(response)).toEqual({ width: 1200, height: 630 });
});

test('renders the GitHub card at 1280x640 with the install pill', async () => {
  const card = {
    title: 'AI chat and agents for React and Angular.',
    subtitle: ['From any model.'],
    code: 'npm install @hashbrownai/react',
    size: 'github' as const,
  };

  const response = await renderCard(card);

  expect(await pngSize(response)).toEqual({ width: 1280, height: 640 });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/card.spec.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `card.tsx`**

Every element Satori lays out with children needs an explicit `display: 'flex'`. Logo sizes keep each SVG's aspect ratio: mark 144x136, wordmark 214x32, LiveLoveApp mark 320x120.

```tsx
import { ImageResponse } from 'next/og';
import { loadCardFonts, svgDataUri } from './assets';
import { CARD_COLORS, GITHUB_SIZE, OG_SIZE, titleSize } from './tokens';

/** What a card says. */
export interface CardContent {
  /** The headline, bottom left. */
  title: string;
  /** Lines under the title, in muted text. */
  subtitle: string[];
  /** Optional code shown in a mono pill under the subtitle. */
  code?: string;
  /** `og` (1200x630, default) or `github` (1280x640). */
  size?: 'og' | 'github';
}

/**
 * The one card layout, in LiveLoveApp's house style: hashbrown's logo top
 * left, "by" and the LiveLoveApp mark top right, the title and subtitle bottom
 * left, on white.
 */
export function Card({ title, subtitle, code, size = 'og' }: CardContent) {
  const { width, height } = size === 'github' ? GITHUB_SIZE : OG_SIZE;
  const padding = size === 'github' ? '80px 96px' : '72px';
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding,
        background: CARD_COLORS.ground,
        color: CARD_COLORS.ink,
        fontFamily: 'Hanken Grotesk',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={svgDataUri('hashbrown-mark')} width={68} height={64} alt="" />
          <img src={svgDataUri('hashbrown-wordmark')} width={268} height={40} alt="" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: CARD_COLORS.muted }}>
          by
          <img src={svgDataUri('lla-mark')} width={80} height={30} alt="" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            ...titleSize(title),
            fontWeight: 600,
            letterSpacing: '-0.03em',
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {subtitle.map((line) => (
            <div key={line} style={{ display: 'flex', fontSize: 26, color: CARD_COLORS.muted, maxWidth: 1000 }}>
              {line}
            </div>
          ))}
        </div>
        {code ? (
          <div style={{ display: 'flex', marginTop: 32 }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains Mono',
                fontSize: 24,
                padding: '10px 24px',
                background: CARD_COLORS.surface,
                border: `1px solid ${CARD_COLORS.rule}`,
                borderRadius: 999,
              }}
            >
              {code}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Render a card to a PNG response with the card fonts loaded.
 *
 * @param content - What the card says and which size to render.
 */
export async function renderCard(content: CardContent): Promise<ImageResponse> {
  const { width, height } = content.size === 'github' ? GITHUB_SIZE : OG_SIZE;
  return new ImageResponse(<Card {...content} />, {
    width,
    height,
    fonts: await loadCardFonts(),
  });
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/card.spec.tsx`
Expected: 2 passed. If `next/og` cannot load its wasm under Vitest, stop and report; do not mock it. The point of the test is that a real render succeeds.

- [ ] **Step 5: Look at a render**

Write a scratch PNG and view it with the Read tool (scratch files go in the session scratchpad, not the repo):

```bash
npx tsx -e "import('./www/src/lib/og/card.tsx').then(async m => { const r = await m.renderCard({ title: 'Hashbrown v0.3 is seasoned with support for MCP, open-weight models, new prompt helpers, and a fresh docs site', subtitle: ['Aug 6, 2025 · hashbrown blog'] }); require('fs').writeFileSync(process.env.OUT, Buffer.from(await r.arrayBuffer())); })"
```

with `OUT=<scratchpad>/long-title.png`. Check: three title lines, nothing clipped, logo top left, "by" + mark top right. Compare against the approved mockup (`.superpowers/brainstorm/*/content/family.html`).

- [ ] **Step 6: Commit**

```bash
git add www/src/lib/og/card.tsx www/test/og/card.spec.tsx
git commit -m "feat(www): the social card layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Default card and metadata

**Files:**
- Create: `www/src/app/opengraph-image.tsx`
- Modify: `www/src/lib/site-metadata.ts`, `www/src/app/layout.tsx:18-23`
- Modify tests: `www/test/site-metadata.spec.ts`, `www/test/blog/blog-index.spec.tsx:59-70`, `www/test/blog/blog-post.spec.tsx:64-82`
- Delete: `www/public/image/meta/og-default.png`, `www/public/image/meta/twitter-card.png`

- [ ] **Step 1: Change the metadata tests first**

`www/test/site-metadata.spec.ts`: the import becomes `import { pageMetadata } from '../src/lib/site-metadata';`, and the first test asserts no image is forced, so Next's nearest `opengraph-image` applies:

```ts
test('sets the title and Open Graph fields from one source', () => {
  const metadata = pageMetadata({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
  });

  expect(metadata.title).toBe('Home: Hashbrown Docs');
  expect(metadata.description).toBe('Hashbrown Docs.');
  expect(metadata.openGraph).toMatchObject({
    title: 'Home: Hashbrown Docs',
    description: 'Hashbrown Docs.',
  });
  expect(metadata.openGraph).not.toHaveProperty('images');
});
```

`www/test/blog/blog-index.spec.tsx`: replace the `og.images` assertion with `expect(og).not.toHaveProperty('images');`.

`www/test/blog/blog-post.spec.tsx`: replace the `og.images` assertion with:

```ts
  expect(og.images).toEqual(
    readBlogPost(slug)?.ogImage ? [readBlogPost(slug)?.ogImage] : undefined,
  );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/site-metadata.spec.ts www/test/blog`
Expected: FAIL on the three changed assertions (images still default to `og-default.png`).

- [ ] **Step 3: Stop forcing the default image**

In `www/src/lib/site-metadata.ts`: delete `DEFAULT_OG_IMAGE` and its doc comment, update the `image` field's comment to `/** Absolute Open Graph image URL; omitted, Next uses the route's opengraph-image. */`, and build `images` only when given:

```ts
export function pageMetadata(input: PageMetadataInput): Metadata {
  const images = input.image ? { images: [input.image] } : {};
  return {
    title: input.title,
    description: input.description,
    openGraph: input.publishedTime
      ? {
          ...SITE_OPEN_GRAPH,
          type: 'article',
          title: input.title,
          description: input.description,
          ...images,
          publishedTime: input.publishedTime,
        }
      : {
          ...SITE_OPEN_GRAPH,
          type: 'website',
          title: input.title,
          description: input.description,
          ...images,
        },
  };
}
```

- [ ] **Step 4: Drop the hard-coded Twitter image**

In `www/src/app/layout.tsx`, the `twitter` block becomes (X falls back to `og:image` when `twitter:image` is absent):

```ts
  twitter: {
    card: 'summary_large_image',
    site: '@liveloveappdev',
    creator: '@liveloveappdev',
  },
```

- [ ] **Step 5: Add the default card**

`www/src/app/opengraph-image.tsx`:

```tsx
import { CARD_DEFAULT_SUBTITLE, CARD_TAGLINE } from '../lib/og/copy';
import { renderCard } from '../lib/og/card';
import { OG_SIZE } from '../lib/og/tokens';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = `hashbrown: ${CARD_TAGLINE} ${CARD_DEFAULT_SUBTITLE}. By LiveLoveApp.`;

/** The site-wide share card: every page without its own card uses it. */
export default function OpenGraphImage() {
  return renderCard({ title: CARD_TAGLINE, subtitle: [CARD_DEFAULT_SUBTITLE] });
}
```

- [ ] **Step 6: Delete the static cards**

```bash
git rm www/public/image/meta/og-default.png www/public/image/meta/twitter-card.png
grep -rn "og-default\|twitter-card\|DEFAULT_OG_IMAGE" www/src www/test
```

Expected: the grep prints nothing.

- [ ] **Step 7: Run the tests and see them pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/site-metadata.spec.ts www/test/blog`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A www/src/app/opengraph-image.tsx www/src/lib/site-metadata.ts www/src/app/layout.tsx www/test www/public/image/meta
git commit -m "feat(www): generated default share card replaces the mascot PNGs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Blog post cards

**Files:**
- Create: `www/src/app/blog/[slug]/opengraph-image.tsx`
- Test: `www/test/og/blog-card.spec.ts`

- [ ] **Step 1: Write the failing test**

`www/test/og/blog-card.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { generateStaticParams as pageParams } from '../../src/app/blog/[slug]/page';
import {
  blogCardContent,
  generateStaticParams,
} from '../../src/app/blog/[slug]/opengraph-image';

test('every blog post has a card', () => {
  const pages = pageParams();

  const cards = generateStaticParams();

  expect(cards).toEqual(pages);
});

test('a post card shows the title and the date', () => {
  const slug = '2026-10-08-hashbrown-v-0-7-0';

  const content = blogCardContent(slug);

  expect(content).toEqual({
    title: 'Hashbrown v0.7 moves to AG-UI 1.0',
    subtitle: ['Oct 8, 2026 · hashbrown blog'],
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/blog-card.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the blog card route**

`www/src/app/blog/[slug]/opengraph-image.tsx`:

```tsx
import { formatPostDate } from '../../../components/blog/post-date';
import { renderCard, type CardContent } from '../../../lib/og/card';
import { OG_SIZE } from '../../../lib/og/tokens';
import { listBlogPosts, readBlogPost } from '../../../lib/content';

type Params = { slug: string };

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A hashbrown blog post';
export const dynamicParams = false;

/** One card per post, prerendered. */
export function generateStaticParams(): Params[] {
  return listBlogPosts().map(({ slug }) => ({ slug }));
}

/**
 * A post's card: its title, then its date.
 *
 * @param slug - The post's URL slug.
 */
export function blogCardContent(slug: string): CardContent {
  const post = readBlogPost(slug);
  if (!post) {
    throw new Error(`No blog post ${slug}`);
  }
  return {
    title: post.title,
    subtitle: [`${formatPostDate(post.date)} · hashbrown blog`],
  };
}

/** The post's share card. */
export default async function BlogCard({ params }: { params: Promise<Params> }) {
  return renderCard(blogCardContent((await params).slug));
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/blog-card.spec.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add 'www/src/app/blog/[slug]/opengraph-image.tsx' www/test/og/blog-card.spec.ts
git commit -m "feat(www): a share card for every blog post

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs cards

**Files:**
- Create: `www/src/app/og/docs/[sdk]/[...slug]/route.tsx`
- Modify: `www/src/app/docs/[sdk]/[...slug]/page.tsx` (`generateMetadata`)
- Test: `www/test/og/docs-card.spec.ts`

- [ ] **Step 1: Write the failing test**

`www/test/og/docs-card.spec.ts`:

```ts
import { expect, test } from 'vitest';
import {
  generateMetadata,
  generateStaticParams as pageParams,
} from '../../src/app/docs/[sdk]/[...slug]/page';
import {
  docsCardContent,
  generateStaticParams,
} from '../../src/app/og/docs/[sdk]/[...slug]/route';

test('every docs page has a card', () => {
  const pages = pageParams();

  const cards = generateStaticParams();

  expect(cards).toEqual(pages);
});

test('a docs card shows the heading, description and SDK', () => {
  const params = { sdk: 'react', slug: ['start', 'quick'] };

  const content = docsCardContent(params);

  expect(content).toEqual({
    title: 'React Quick Start',
    subtitle: ['Take your first steps with Hashbrown.', 'React docs · hashbrown.dev'],
  });
});

test('long descriptions are cut to 120 characters', () => {
  const longest = generateStaticParams()
    .map((params) => docsCardContent(params).subtitle[0])
    .sort((a, b) => b.length - a.length)[0];

  expect(longest.length).toBeLessThanOrEqual(120);
});

test('a docs page points its Open Graph image at its card', async () => {
  const params = { sdk: 'angular', slug: ['start', 'quick'] };

  const meta = await generateMetadata({ params: Promise.resolve(params) });

  expect(meta.openGraph?.images).toEqual(['/og/docs/angular/start/quick']);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/docs-card.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the docs card route**

A route handler, not `opengraph-image.tsx`: Next refuses a metadata route below `[...slug]`. `force-static` with `generateStaticParams` prerenders every card at build time.

`www/src/app/og/docs/[sdk]/[...slug]/route.tsx`:

```tsx
import { renderCard, type CardContent } from '../../../../../lib/og/card';
import { docsCardTitle, truncateAtWord } from '../../../../../lib/og/copy';
import { listDocs, readDoc, SDKS, type Sdk } from '../../../../../lib/content';

type Params = { sdk: string; slug: string[] };

export const dynamic = 'force-static';
export const dynamicParams = false;

const SDK_LABEL: Record<Sdk, string> = { react: 'React', angular: 'Angular' };

/** One card per docs page, prerendered. */
export function generateStaticParams(): Params[] {
  return SDKS.flatMap((sdk) => listDocs(sdk).map((slug) => ({ sdk, slug })));
}

/**
 * A docs page's card: its heading, its description (cut to 120 characters),
 * and which SDK the page is for.
 *
 * @param params - The page's SDK and slug.
 */
export function docsCardContent({ sdk, slug }: Params): CardContent {
  const doc = (SDKS as readonly string[]).includes(sdk)
    ? readDoc(sdk as Sdk, slug)
    : undefined;
  if (!doc) {
    throw new Error(`No docs page ${sdk}/${slug.join('/')}`);
  }
  const footer = `${SDK_LABEL[sdk as Sdk]} docs · hashbrown.dev`;
  return {
    title: docsCardTitle(doc.title),
    subtitle: doc.description
      ? [truncateAtWord(doc.description, 120), footer]
      : [footer],
  };
}

/** The docs page's share card. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  return renderCard(docsCardContent(await params));
}
```

- [ ] **Step 4: Point docs metadata at the card**

In `www/src/app/docs/[sdk]/[...slug]/page.tsx`, `generateMetadata` returns:

```ts
  return doc
    ? pageMetadata({
        title: doc.title,
        description: doc.description,
        image: `/og/docs/${sdk}/${slug.join('/')}`,
      })
    : {};
```

A relative URL is fine: the root layout sets `metadataBase` to `https://hashbrown.dev`. Update the `image` doc comment in `site-metadata.ts` from "Absolute Open Graph image URL" to "Open Graph image URL (absolute, or relative to `metadataBase`)".

- [ ] **Step 5: Run the test and see it pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/docs-card.spec.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add 'www/src/app/og' 'www/src/app/docs/[sdk]/[...slug]/page.tsx' www/src/lib/site-metadata.ts www/test/og/docs-card.spec.ts
git commit -m "feat(www): a share card for every docs page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: GitHub preview

**Files:**
- Create: `www/src/app/github-card/route.tsx`, `scripts/export-github-card.mjs`, `docs/brand/github-social-preview.png`
- Test: `www/test/og/github-card.spec.ts`

- [ ] **Step 1: Write the failing test**

`www/test/og/github-card.spec.ts`:

```ts
import { expect, test } from 'vitest';
import { GET, dynamic } from '../../src/app/github-card/route';

test('the GitHub card is a static 1280x640 PNG', async () => {
  const response = await GET();

  const view = new DataView(await response.arrayBuffer());
  expect(dynamic).toBe('force-static');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect({ width: view.getUint32(16), height: view.getUint32(20) }).toEqual({
    width: 1280,
    height: 640,
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/github-card.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the route**

`www/src/app/github-card/route.tsx`:

```tsx
import { renderCard } from '../../lib/og/card';
import { CARD_GITHUB_SUBTITLE, CARD_INSTALL, CARD_TAGLINE } from '../../lib/og/copy';

export const dynamic = 'force-static';

/**
 * The repository's social preview at GitHub's 1280x640. GitHub has no API for
 * it: `scripts/export-github-card.mjs` saves this to
 * `docs/brand/github-social-preview.png` for a maintainer to upload.
 */
export function GET() {
  return renderCard({
    title: CARD_TAGLINE,
    subtitle: [CARD_GITHUB_SUBTITLE],
    code: CARD_INSTALL,
    size: 'github',
  });
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run --config www/vitest.config.mts www/test/og/github-card.spec.ts`
Expected: 1 passed.

- [ ] **Step 5: Write the export script**

`scripts/export-github-card.mjs`:

```js
/**
 * Save the GitHub social preview from the site's /github-card route.
 *
 *   node scripts/export-github-card.mjs [--origin http://localhost:3000]
 *
 * Defaults to production. Then upload the file at
 * github.com/liveloveapp/hashbrown → Settings → General → Social preview.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = process.argv.indexOf('--origin');
const origin = flag === -1 ? 'https://hashbrown.dev' : process.argv[flag + 1];
const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/brand/github-social-preview.png',
);

const response = await fetch(`${origin}/github-card`);
if (!response.ok || response.headers.get('content-type') !== 'image/png') {
  console.error(`${origin}/github-card: ${response.status} ${response.headers.get('content-type')}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await response.arrayBuffer()));
console.log(`Wrote ${out}`);
console.log('Upload it at https://github.com/liveloveapp/hashbrown/settings → Social preview → Edit.');
```

- [ ] **Step 6: Export the PNG from a local server**

Start the site with the `preview_start` tool (add a `www` entry to `.claude/launch.json`: `npx nx serve www`, port 3000) rather than a raw background shell, then:

```bash
node scripts/export-github-card.mjs --origin http://localhost:3000
```

Expected: `Wrote .../docs/brand/github-social-preview.png`. View it with the Read tool and check margins: content stays at least 64px from the left and right edges.

- [ ] **Step 7: Commit**

```bash
git add www/src/app/github-card scripts/export-github-card.mjs docs/brand/github-social-preview.png www/test/og/github-card.spec.ts
git commit -m "feat(www): GitHub social preview card and export script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: e2e — every card is prerendered

**Files:**
- Modify: `www/src/tools/route-report.ts` (the route parity table, after `otherRoutes`)

- [ ] **Step 1: Add card routes to the parity check**

After `const otherRoutes = ['/', '/api'];` add:

```ts
// Share cards: the default, one per blog post, one per docs page, and the
// GitHub preview. All prerender at build time.
const cardRoutes = [
  '/opengraph-image',
  '/github-card',
  ...blogRoutes
    .filter((route) => route !== '/blog')
    .map((route) => `${route}/opengraph-image`),
  ...llmsDocs.map((route) => route.replace(/^\/docs\//, '/og/docs/')),
];
```

and add `['share cards', cardRoutes],` to the array the parity loop iterates.

- [ ] **Step 2: Build and run the report**

Run: `npx nx e2e www` (depends on `build`).
Expected: `share cards  N/N` with no `missing` lines, exit 0. If `/opengraph-image` is absent from `prerender-manifest.json` while `www/.next/server/app/opengraph-image.body` exists, the route is static but keyed differently: print the manifest keys containing `opengraph` and match the key Next uses rather than weakening the check.

- [ ] **Step 3: Check the served tags**

```bash
grep -o '<meta property="og:image"[^>]*>' www/.next/server/app/index.html
grep -o '<meta property="og:image"[^>]*>' www/.next/server/app/blog/2026-10-08-hashbrown-v-0-7-0.html
grep -o '<meta property="og:image"[^>]*>' www/.next/server/app/docs/react/start/quick.html
grep -o '<meta name="twitter:[^>]*>' www/.next/server/app/index.html
```

Expected: `https://hashbrown.dev/opengraph-image?…`, `https://hashbrown.dev/blog/2026-10-08-hashbrown-v-0-7-0/opengraph-image?…`, `https://hashbrown.dev/og/docs/react/start/quick`; Twitter tags show `summary_large_image` and the two handles and no `og-default`/`twitter-card` image.

- [ ] **Step 4: Commit**

```bash
git add www/src/tools/route-report.ts
git commit -m "test(www): the route report checks every share card is prerendered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify and review

- [ ] **Step 1: Full checks**

```bash
npx nx build www
npx nx test www
npx nx lint www
npx nx e2e www
```

Expected: all pass. Report any warning. `nx build www` may dirty `tsdoc-metadata.json`; revert it before committing (`git checkout -- '**/tsdoc-metadata.json'`).

- [ ] **Step 2: Human review of the renders**

Copy these from `www/.next/server/app/` (`.body` files are the PNG bytes) into the scratchpad as `.png` and send them to the user with SendUserFile: the default card, the v0.7 post, the v0.3 post (longest title), `docs/react/start/quick`, the docs page with the longest description, and `docs/brand/github-social-preview.png`. Tests constrain the cards; the user approves them.

- [ ] **Step 3: Clean up**

Remove `.superpowers/probe` (the Next catch-all probe from planning) and stop any preview server started for Task 7.
