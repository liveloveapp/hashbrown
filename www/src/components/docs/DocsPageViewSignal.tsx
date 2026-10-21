'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trackDocsPageViewed } from '../../lib/analytics/client';
import type { DocsFramework } from '../../lib/analytics/events';

/**
 * Tracks `docs:page_viewed` once per docs pathname. Mounted by the docs
 * layout, which persists across docs navigations, so the effect re-runs only
 * when the pathname changes. Renders nothing.
 *
 * @param props.sdk - The framework of the docs section being read.
 */
export function DocsPageViewSignal({ sdk }: { sdk: DocsFramework }) {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== lastTracked.current) {
      lastTracked.current = pathname;
      trackDocsPageViewed({ pathname, framework: sdk });
    }
  }, [pathname, sdk]);

  return null;
}
