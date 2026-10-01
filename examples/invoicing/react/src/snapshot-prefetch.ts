import type { LedgerSnapshot } from '@invoicing/contracts';

declare global {
  interface Window {
    /**
     * The `/api/snapshot` request `index.html` starts before the app script
     * loads, so the server's work overlaps the script's download.
     */
    __invoicingSnapshot?: Promise<LedgerSnapshot>;
  }
}

/**
 * Hand over the snapshot request `index.html` started, once: a later
 * bootstrap (or a host without the inline script) gets `undefined` and
 * fetches for itself.
 */
export function takePrefetchedSnapshot(
  host: Pick<Window, '__invoicingSnapshot'> = window,
): Promise<LedgerSnapshot> | undefined {
  const prefetched = host.__invoicingSnapshot;
  host.__invoicingSnapshot = undefined;
  return prefetched;
}
