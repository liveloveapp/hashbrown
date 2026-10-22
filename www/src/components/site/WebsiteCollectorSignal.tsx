'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { installWebsiteCollector } from '../../lib/growth/website-collector';

/**
 * Reports the visitor's pages to the first-party growth collector when
 * collection is enabled. Renders nothing.
 */
export function WebsiteCollectorSignal() {
  const pathname = usePathname();

  useEffect(() => {
    installWebsiteCollector()?.observePath(pathname);
  }, [pathname]);

  return null;
}
