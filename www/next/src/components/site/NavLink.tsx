'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isActivePath } from './links';

/**
 * An internal link that adds `activeClassName` while the current path is the
 * link or one of its children, like Angular's `routerLinkActive`.
 */
export function NavLink({
  href,
  className,
  activeClassName,
  children,
}: {
  href: string;
  className?: string;
  activeClassName: string;
  children?: ReactNode;
}) {
  const active = isActivePath(usePathname(), href);
  const classes = [className, active ? activeClassName : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Link
      href={href}
      className={classes || undefined}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
