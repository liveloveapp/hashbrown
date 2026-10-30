/**
 * The docs origins that may frame and drive the hosted workbench, as CSP
 * source expressions: the docs site, a one-label Vercel preview (`*.`) and a
 * localhost dev server on any port (`:*`). The hosted workbench's
 * `frame-ancestors` header and `isAllowedParentOrigin` both read this list.
 *
 * No imports: `tools/workbench/vercel-config.mjs` loads this file directly.
 */
export const WORKBENCH_DOCS_ORIGINS = [
  'https://hashbrown.dev',
  'https://www.hashbrown.dev',
  'https://*.vercel.app',
  'http://localhost:*',
] as const;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patterns = WORKBENCH_DOCS_ORIGINS.map(
  (source) =>
    new RegExp(
      `^${escape(source)
        .replace('\\*\\.', '[a-z0-9-]+\\.')
        .replace(':\\*', ':\\d+')}$`,
    ),
);

/**
 * Whether an origin matches one of {@link WORKBENCH_DOCS_ORIGINS}: exactly,
 * with one host label in place of `*.`, or with a port in place of `:*`.
 *
 * @param origin - A `MessageEvent.origin`.
 */
export function matchesWorkbenchDocsOrigin(origin: string): boolean {
  return patterns.some((pattern) => pattern.test(origin));
}
