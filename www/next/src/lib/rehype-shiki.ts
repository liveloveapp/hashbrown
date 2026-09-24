import type { Element, ElementContent, Root } from 'hast';
import {
  createHighlighter,
  type Highlighter,
  type ThemeRegistration,
} from 'shiki';
import type { Plugin } from 'unified';
// Copied from www/analog/src/app/themes; a real migration moves it here.
import shikiHashbrown from './shiki-hashbrown';

/** Languages used by fenced code in the docs and blog. */
const LANGS = [
  'typescript',
  'tsx',
  'html',
  'json',
  'shellscript',
  'markdown',
] as const;

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  sh: 'shellscript',
  bash: 'shellscript',
  txt: 'text',
};

let highlighter: Promise<Highlighter> | undefined;

/**
 * The site's shared Shiki highlighter (hashbrown theme, the docs' languages),
 * created once per process.
 */
export function getHighlighter(): Promise<Highlighter> {
  return (highlighter ??= createHighlighter({
    // A VS Code theme export; Shiki fills in fg/bg from `colors` at runtime.
    themes: [shikiHashbrown as unknown as ThemeRegistration],
    langs: [...LANGS],
  }));
}

function languageOf(code: Element): string {
  const classes = (code.properties?.className as string[] | undefined) ?? [];
  const lang =
    classes.find((c) => c.startsWith('language-'))?.slice('language-'.length) ??
    'text';
  return ALIASES[lang] ?? lang;
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') {
    return node.value;
  }
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

function codeChild(node: Element): Element | undefined {
  if (node.tagName !== 'pre') {
    return undefined;
  }
  return node.children.find(
    (c): c is Element => c.type === 'element' && c.tagName === 'code',
  );
}

function highlightIn(parent: { children: ElementContent[] }, hl: Highlighter) {
  parent.children = parent.children.map((child) => {
    if (child.type !== 'element') {
      return child;
    }
    const code = codeChild(child);
    if (!code) {
      highlightIn(child, hl);
      return child;
    }
    const requested = languageOf(code);
    const lang = hl.getLoadedLanguages().includes(requested)
      ? requested
      : 'text';
    const highlighted = hl.codeToHast(textOf(code).replace(/\n$/, ''), {
      lang,
      theme: 'hashbrown',
    });
    return highlighted.children[0] as Element;
  });
}

/**
 * Rehype plugin: highlight `<pre><code class="language-x">` blocks with the
 * site's Shiki theme at build time. Unknown languages render as plain text
 * instead of failing the build.
 */
export const rehypeShiki: Plugin<[], Root> = () => async (tree) => {
  highlightIn(
    tree as unknown as { children: ElementContent[] },
    await getHighlighter(),
  );
};

/**
 * Highlight a code string with the site's Shiki theme, producing the same
 * `<pre class="shiki hashbrown">` markup as fenced code in the docs. Unlike
 * {@link rehypeShiki}, an unknown language throws, so a typo fails the build.
 *
 * @param code - The source to highlight.
 * @param lang - A language the site loads, such as `typescript`, `tsx` or `html`.
 * @returns The highlighted HTML.
 */
export async function highlightCode(
  code: string,
  lang: string,
): Promise<string> {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang: ALIASES[lang] ?? lang,
    theme: 'hashbrown',
  });
}
