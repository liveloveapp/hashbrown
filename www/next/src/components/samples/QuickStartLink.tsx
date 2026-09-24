'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { quickStartUrl, type Sdk } from '../site/links';
import { useSiteConfig } from '../use-site-config';

/**
 * A link to the quick start for the reader's stored SDK preference, as the
 * Angular `ConfigService` provided. Defaults to Angular on the server.
 *
 * @param props.sdk - Force an SDK instead of reading the stored preference.
 * @param props.children - The link text.
 */
export function QuickStartLink({
  sdk,
  children,
}: {
  sdk?: Sdk;
  children: ReactNode;
}) {
  const { config } = useSiteConfig();
  return <Link href={quickStartUrl(sdk ?? config.sdk)}>{children}</Link>;
}
