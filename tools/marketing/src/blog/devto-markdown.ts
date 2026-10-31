const SITE_ORIGIN = 'https://hashbrown.dev';

const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(\r?\n|$)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CODE_SPAN = /(`+)(?!`)[^`\n]*?(?:`(?!`)[^`\n]*?)*?(?<!`)\1(?!`)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const CODE_EXAMPLE_OPEN = /^\s*<hb-code-example\s+header="([^"]*)"\s*>\s*$/;
const SITE_ONLY_TAG =
  /^\s*(?:<\/hb-code-example>|<\/?hb-carousel(?:\s[^>]*)?>|<\/hb-prose-demo>|<\/www-atc-demo-video>)\s*$/;
/** Interactive or video-only elements: the opening tag (and a same-line close) becomes a link. */
const DEMO_LINKS: [RegExp, string][] = [
  [
    /^\s*<hb-prose-demo\s*>(?:\s*<\/hb-prose-demo>)?\s*$/,
    'See the interactive demo on hashbrown.dev',
  ],
  [
    /^\s*<www-atc-demo-video\s*>(?:\s*<\/www-atc-demo-video>)?\s*$/,
    'Watch the demo on hashbrown.dev',
  ],
];
const LOOM_EMBED =
  /^\s*<div[^>]*>\s*<iframe[^>]*\ssrc="https:\/\/www\.loom\.com\/embed\/([a-f0-9]+)[^"]*"[^>]*><\/iframe>\s*<\/div>\s*$/i;

/**
 * Whether a URL should be left exactly as written: empty, an anchor, a
 * protocol-relative URL, or anything with a scheme (`https:`, `mailto:`, ...).
 */
function isUntouched(url: string): boolean {
  return (
    url === '' ||
    url.startsWith('#') ||
    url.startsWith('//') ||
    SCHEME.test(url)
  );
}

/** Make one URL absolute. `base` is the page the markdown is served from. */
function absolutize(url: string, base: string): string {
  if (isUntouched(url)) {
    return url;
  }
  return url.startsWith('/')
    ? new URL(url, SITE_ORIGIN).href
    : new URL(url, base).href;
}

/** Rewrite every link, image, reference definition and HTML attribute URL in a run of prose. */
function rewriteUrls(text: string, base: string): string {
  return text
    .replace(
      /(!?\[[^\]\n]*\]\(\s*<?)([^)\s>]+)/g,
      (_m, head: string, url: string) => head + absolutize(url, base),
    )
    .replace(
      /^(\s{0,3}\[[^\]\n]+\]:\s*<?)([^\s>]+)/,
      (_m, head: string, url: string) => head + absolutize(url, base),
    )
    .replace(
      /(\s(?:src|href)=)(["'])(.*?)\2/g,
      (_m, head: string, quote: string, url: string) =>
        `${head}${quote}${absolutize(url, base)}${quote}`,
    );
}

/** Rewrite URLs in a line, skipping inline code spans. */
function rewriteLine(line: string, base: string): string {
  let out = '';
  let last = 0;
  for (const match of line.matchAll(CODE_SPAN)) {
    out += rewriteUrls(line.slice(last, match.index), base) + match[0];
    last = match.index + match[0].length;
  }
  return out + rewriteUrls(line.slice(last), base);
}

/**
 * Convert a hashbrown.dev blog post (`www/content/blog/<slug>.md`) into
 * markdown that dev.to renders correctly.
 *
 * - Frontmatter is removed. A `youtube:` value becomes a dev.to
 *   `{% embed %}` tag at the top, as the site shows that video above the post.
 * - Root-relative links and images (`/docs/react`) are made absolute against
 *   `https://hashbrown.dev`.
 * - Page-relative ones (no leading `/` and no scheme, like `./a.png`, `a.png`
 *   or `../x`) are resolved against `postUrl` with a trailing slash added, as
 *   `new URL(path, postUrl + '/')` does, so `./a.png` against
 *   `https://hashbrown.dev/blog/slug` is `https://hashbrown.dev/blog/slug/a.png`.
 *   The slash makes the post URL behave like a directory, which is how
 *   relative assets sit next to a post.
 * - `#anchor`, `mailto:` and absolute URLs are left alone.
 * - Covered syntax: inline links and images (with an optional title),
 *   reference definitions, and `src`/`href` attributes in raw HTML.
 * - Fenced code blocks (backticks or tildes, any length of three or more,
 *   closed only by a matching fence) and inline code spans are never changed.
 * - Site-only components become plain markdown: `<hb-code-example header="x">`
 *   becomes a bold `**x**` label above its code block; `<hb-carousel>` is
 *   unwrapped and its images kept; the interactive `<hb-prose-demo>` and
 *   the video-only `<www-atc-demo-video>` (single-line or open/close on separate
 *   lines) become one link line to the post on hashbrown.dev, so the lead-in
 *   sentence still makes sense; the Loom `<iframe>` wrapper becomes
 *   a `[Watch the video](...)` link, since dev.to does not render iframes.
 *
 * @param markdown - The full contents of the post's markdown file.
 * @param postUrl - The post's public URL, e.g. `https://hashbrown.dev/blog/<slug>`.
 */
export function toDevtoMarkdown(markdown: string, postUrl: string): string {
  const base = `${postUrl.replace(/\/+$/, '')}/`;
  let body = markdown;
  let embed: string | undefined;

  const frontmatter = FRONTMATTER.exec(markdown);
  if (frontmatter) {
    body = markdown.slice(frontmatter[0].length).replace(/^(\r?\n)+/, '');
    embed = /^youtube:\s*(\S+)\s*$/m.exec(frontmatter[1] ?? '')?.[1];
  }

  const out: string[] = [];
  let fence: { char: string; length: number } | undefined;
  let removed = false;
  let inCarousel = false;

  for (const line of body.split('\n')) {
    if (fence) {
      out.push(line);
      const close = new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}\\s*$`);
      if (close.test(line)) {
        fence = undefined;
      }
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1].startsWith('`') && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length };
      out.push(line);
      continue;
    }

    if (SITE_ONLY_TAG.test(line)) {
      removed = true;
      inCarousel = /^\s*<hb-carousel/.test(line) ? true : inCarousel;
      inCarousel = /^\s*<\/hb-carousel/.test(line) ? false : inCarousel;
      continue;
    }
    const demo = DEMO_LINKS.find(([tag]) => tag.test(line));
    if (demo) {
      out.push(`[${demo[1]}](${postUrl})`);
      continue;
    }
    const label = CODE_EXAMPLE_OPEN.exec(line);
    if (label) {
      out.push(`**${label[1]}**`);
      continue;
    }
    const loom = LOOM_EMBED.exec(line);
    if (loom) {
      out.push(`[Watch the video](https://www.loom.com/share/${loom[1]})`);
      continue;
    }

    // A removed tag leaves its surrounding blank lines behind; keep one.
    if (
      line.trim() === '' &&
      removed &&
      (out.length === 0 || out.at(-1)?.trim() === '')
    ) {
      continue;
    }
    if (line.trim() !== '') {
      removed = false;
    }
    // Carousel images are indented on the site; indentation would make code blocks here.
    out.push(rewriteLine(inCarousel ? line.trimStart() : line, base));
  }

  const result = out.join('\n');
  return embed ? `{% embed ${embed} %}\n\n${result}` : result;
}
