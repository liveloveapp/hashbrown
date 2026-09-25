/**
 * Whether a menu link is active for the current path: on the linked page or
 * below it, like Angular's non-exact `routerLinkActive`.
 *
 * @param pathname - The current path, or `null` before the router knows it.
 * @param href - The link target.
 * @param exact - Match only the linked page itself.
 */
export function isLinkActive(
  pathname: string | null,
  href: string,
  exact = false,
): boolean {
  if (!pathname) {
    return false;
  }
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}
