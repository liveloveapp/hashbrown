import { createHighlighter, type Highlighter } from 'shiki';
import shikiHashbrown from '../app/themes/shiki-hashbrown';

/** Languages the site highlights at build time. Unknown languages throw, so a typo fails the build. */
export const SITE_LANGS = ['tsx', 'typescript', 'html'] as const;

let highlighter: Promise<Highlighter> | undefined;

/**
 * Create the site's Shiki highlighter once, shared by the client and SSR builds.
 */
export function getSiteHighlighter(): Promise<Highlighter> {
  return (highlighter ??= createHighlighter({
    // The theme object matches Shiki's ThemeRegistration shape at runtime.
    themes: [
      shikiHashbrown as Parameters<
        typeof createHighlighter
      >[0]['themes'][number],
    ],
    langs: [...SITE_LANGS],
  }));
}

/** A code sample to highlight. */
export interface Sample {
  code: string;
  lang?: string;
}

/**
 * Highlight one sample with the hashbrown theme, producing the same markup the docs use.
 *
 * @param hl - A highlighter, or any object with a compatible `codeToHtml`.
 * @param sample - The code and its language (defaults to TypeScript).
 */
export function highlightSample(
  hl: Pick<Highlighter, 'codeToHtml'>,
  sample: Sample,
): string {
  return hl.codeToHtml(sample.code, {
    lang: sample.lang ?? 'typescript',
    theme: 'hashbrown',
  });
}

/**
 * Build the source of the `virtual:home-code-html` module from the homepage content.
 *
 * @param hl - The highlighter to use.
 * @param content - `HERO_CODE` and `STEPS` from `home.content.ts`.
 */
export function renderHomeCodeModule(
  hl: Pick<Highlighter, 'codeToHtml'>,
  content: {
    HERO_CODE: Record<string, Sample>;
    STEPS: Record<string, Sample[]>;
  },
): string {
  const map = <T, R>(o: Record<string, T>, f: (v: T) => R) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const html = {
    hero: map(content.HERO_CODE, (s) => highlightSample(hl, s)),
    steps: map(content.STEPS, (steps) =>
      steps.map((s) => highlightSample(hl, s)),
    ),
  };
  return `export const HOME_CODE_HTML = ${JSON.stringify(html)};`;
}
