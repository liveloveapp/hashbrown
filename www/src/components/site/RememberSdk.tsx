'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { sdkFromPath } from '../../lib/site-config';
import { useSiteConfig } from '../use-site-config';

/**
 * Save the SDK of the page being viewed, as the Angular `ConfigService` did on
 * every navigation, so links elsewhere (header, footer, homepage) follow the
 * framework the reader last looked at.
 */
export function RememberSdk() {
  const pathname = usePathname();
  const { update } = useSiteConfig();
  const sdk = pathname ? sdkFromPath(pathname) : undefined;

  // Save on navigation only. Re-saving whenever the stored value changes
  // would make two tabs on different SDKs overwrite each other forever,
  // because storage changes are shared across tabs.
  useEffect(() => {
    if (sdk) {
      update({ sdk });
    }
  }, [sdk, update]);

  return null;
}
