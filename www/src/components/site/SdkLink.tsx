'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSiteConfig } from '../use-site-config';
import { docsUrl, quickStartUrl, type Sdk } from './links';
import { NavLink } from './NavLink';

const HREFS = { docs: docsUrl, 'quick-start': quickStartUrl } as const;

/**
 * A link to an SDK's docs or quick start. Uses `sdk` when the page knows it
 * (docs pages) and otherwise the reader's saved preference, like the Angular
 * links bound to `ConfigService.sdk`.
 *
 * @param props.to - Which SDK page to link to.
 * @param props.sdk - A fixed SDK; omit to follow the saved preference.
 * @param props.activeClassName - Adds active-link styling via `NavLink`.
 */
export function SdkLink({
  to,
  sdk,
  className,
  activeClassName,
  onClick,
  children,
}: {
  to: keyof typeof HREFS;
  sdk?: Sdk;
  className?: string;
  activeClassName?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const { config } = useSiteConfig();
  const href = HREFS[to](sdk ?? config.sdk);
  if (activeClassName) {
    return (
      <NavLink href={href} className={className} activeClassName={activeClassName}>
        {children}
      </NavLink>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
