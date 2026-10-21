'use client';

import { useEffect } from 'react';
import { trackThreadplaneCtaClick } from '../../lib/analytics/client';
import {
  type ThreadplaneSurface,
  threadplaneSurfaceForPath,
  threadplaneSurfaces,
} from '../../lib/analytics/events';

const THREADPLANE_HOSTS = new Set(['threadplane.ai', 'www.threadplane.ai']);

const SURFACES = new Set<string>(threadplaneSurfaces);

function isThreadplaneSurface(value: string): value is ThreadplaneSurface {
  return SURFACES.has(value);
}

function onClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return;

  let host: string;
  try {
    host = new URL(anchor.href, window.location.href).hostname.toLowerCase();
  } catch {
    return;
  }
  if (!THREADPLANE_HOSTS.has(host)) return;

  const declared = anchor.dataset.surface;
  const surface =
    declared && isThreadplaneSurface(declared)
      ? declared
      : threadplaneSurfaceForPath(window.location.pathname);
  trackThreadplaneCtaClick({ surface, destination_url: anchor.href });
}

/** Middle-clicks open a new tab without firing `click`; count only those. */
function onAuxClick(event: MouseEvent) {
  if (event.button === 1) onClick(event);
}

/**
 * Tracks `marketing:threadplane_cta_click` for every link to threadplane.ai,
 * including links rendered from markdown, with delegated `click` and middle-button
 * `auxclick` listeners on `document` (capture phase). The surface is the anchor's `data-surface` when
 * present, otherwise derived from the page's pathname. Renders nothing.
 */
export function ThreadplaneLinkSignal() {
  useEffect(() => {
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onAuxClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('auxclick', onAuxClick, true);
    };
  }, []);

  return null;
}
