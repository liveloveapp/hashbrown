'use client';

import { useEffect } from 'react';
import { trackThreadplaneCtaClick } from '../../lib/analytics/client';
import {
  type ThreadplaneSurface,
  threadplaneSurfaceForPath,
} from '../../lib/analytics/events';

const THREADPLANE_HOSTS = new Set(['threadplane.ai', 'www.threadplane.ai']);

const SURFACES = new Set<string>([
  'homepage_banner',
  'footer',
  'docs_platforms',
  'blog',
  'email',
]);

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

/**
 * Tracks `marketing:threadplane_cta_click` for every link to threadplane.ai,
 * including links rendered from markdown, with one delegated click listener on
 * `document` (capture phase). The surface is the anchor's `data-surface` when
 * present, otherwise derived from the page's pathname. Renders nothing.
 */
export function ThreadplaneLinkSignal() {
  useEffect(() => {
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
