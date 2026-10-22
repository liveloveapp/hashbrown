'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { trackCtaClick } from '../../lib/analytics/client';
import type { AnalyticsSurface, CtaId } from '../../lib/analytics/events';

/** Props of {@link TrackedLink}: a `next/link` plus the CTA it reports as. */
export type TrackedLinkProps = ComponentProps<typeof Link> & {
  href: string;
  ctaId: CtaId;
  surface: AnalyticsSurface;
};

/**
 * A `next/link` that tracks `marketing:cta_click` when clicked and then
 * navigates as usual. Lets Server Components place tracked CTAs.
 */
export function TrackedLink({
  ctaId,
  surface,
  onClick,
  ...props
}: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackCtaClick({
          cta_id: ctaId,
          surface,
          destination_url: props.href,
        });
        onClick?.(event);
      }}
    />
  );
}
