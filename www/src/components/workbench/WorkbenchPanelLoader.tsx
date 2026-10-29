'use client';

import dynamic from 'next/dynamic';

/**
 * `WorkbenchPanelClient`, split into its own chunk so the panel code and
 * embed client load only on pages that render a panel, not on every page whose
 * markdown elements could.
 */
export const WorkbenchPanelLoader = dynamic(() =>
  import('./WorkbenchPanelClient').then(
    (module) => module.WorkbenchPanelClient,
  ),
);
