import type { Sdk } from '../../lib/content';

/**
 * The link for the SDK switcher: the current docs page in the `target` SDK,
 * or that SDK's `start/intro` when the page has no counterpart there or the
 * current path is not a docs page.
 *
 * @param pathname - The current path, e.g. `/docs/react/start/quick`.
 * @param target - The SDK to switch to.
 * @param targetDocs - The target SDK's docs pages as slug paths, e.g.
 *   `start/quick`.
 */
export function sdkSwitchHref(
  pathname: string | null,
  target: Sdk,
  targetDocs: readonly string[],
): string {
  const [root, , ...slug] = (pathname ?? '').split('/').filter(Boolean);
  const page = slug.join('/');
  return root === 'docs' && targetDocs.includes(page)
    ? `/docs/${target}/${page}`
    : `/docs/${target}/start/intro`;
}
