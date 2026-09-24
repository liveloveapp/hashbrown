import type { Element, ElementContent, Root } from 'hast';
import { createHighlighter, type Highlighter } from 'shiki';
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

function getHighlighter(): Promise<Highlighter> {
  return (highlighter ??= createHighlighter({
    // The theme object matches Shiki's ThemeRegistration shape at runtime.
    themes: [
      shikiHashbrown as Parameters<
        typeof createHighlighter
      >[0]['themes'][number],
    ],
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
