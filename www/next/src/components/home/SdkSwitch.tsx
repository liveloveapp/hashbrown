'use client';

import type { ReactNode } from 'react';
import { useSiteConfig } from '../use-site-config';
import type { Sdk } from './home.content';

/**
 * Show the variant for the framework picked in the homepage toggle. Server
 * Components render both variants (for example build-time highlighted code)
 * and pass them in; this client leaf only chooses one. The server and
 * hydration renders show the default (Angular), then the stored preference.
 *
 * @param props.react - What to show when React is selected.
 * @param props.angular - What to show when Angular is selected.
 */
export function SdkSwitch({ react, angular }: Record<Sdk, ReactNode>) {
  const { config } = useSiteConfig();
  return <>{config.sdk === 'react' ? react : angular}</>;
}
