'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * A link to a member's panel further down the page that scrolls smoothly and
 * records the hash. Port of `SymbolApi.navigateToMethod`.
 */
export function MemberLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.pushState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <a href={`#${id}`} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
