import type { Sdk } from '../../lib/content';

export type { Sdk };

/** The SDK the Angular `ConfigService` falls back to. */
export const DEFAULT_SDK: Sdk = 'angular';

/** The GitHub repository the header and footer link to. */
export const GITHUB_REPO_URL = 'https://github.com/liveloveapp/hashbrown';

/** Window event that opens the search overlay (from `SearchOverlay.ts`). */
export const SEARCH_OVERLAY_OPEN_EVENT = 'hashbrown:search-overlay:open';

/**
 * The docs landing page for an SDK.
 *
 * @param sdk - The SDK whose docs to link to.
 */
export function docsUrl(sdk: Sdk): string {
  return `/docs/${sdk}/start/intro`;
}

/**
 * The quick start page for an SDK.
 *
 * @param sdk - The SDK whose quick start to link to.
 */
export function quickStartUrl(sdk: Sdk): string {
  return `/docs/${sdk}/start/quick`;
}

/**
 * Whether a link is active for the current path, matching Angular's
 * non-exact `routerLinkActive`: the path is the link or one of its children.
 *
 * @param pathname - The current path, or `null` when unknown.
 * @param href - The link's path.
 */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
