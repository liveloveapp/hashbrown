'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLinkActive } from './is-link-active';

/**
 * A menu link that adds `activeClassName` (and `aria-current="page"`) while
 * the current path is on `href` (or below it unless `exact`), like Angular's
 * `routerLinkActive`.
 */
export function MenuLink({
  href,
  className,
  activeClassName,
  exact = false,
  children,
}: {
  href: string;
  className?: string;
  activeClassName?: string;
  exact?: boolean;
  children: ReactNode;
}) {
  const active = isLinkActive(usePathname(), href, exact);

  return (
    <Link
      href={href}
      className={
        [className, active && activeClassName].filter(Boolean).join(' ') ||
        undefined
      }
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
