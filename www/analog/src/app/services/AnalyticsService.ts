import { Injectable } from '@angular/core';

/**
 * Names of the homepage conversion events sent to Fathom.
 */
export type AnalyticsEvent =
  | 'install-copied-react'
  | 'install-copied-angular'
  | 'prompt-copied-react'
  | 'prompt-copied-angular'
  | 'quick-start-clicked'
  | 'threadplane-banner-clicked'
  | 'invoicing-demo-clicked';

/**
 * The subset of the Fathom client used by the site.
 */
export interface FathomClient {
  trackEvent(name: string): void;
}

/**
 * Send an event to Fathom. Does nothing during SSR or when Fathom is blocked or not loaded.
 *
 * @param name - The event name.
 * @param target - The object that may hold `fathom`. Defaults to `window` in the browser.
 */
export function trackEvent(
  name: AnalyticsEvent,
  target: { fathom?: FathomClient } | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as { fathom?: FathomClient }),
): void {
  target?.fathom?.trackEvent(name);
}

/**
 * Injectable wrapper around {@link trackEvent} for components.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  track(name: AnalyticsEvent): void {
    trackEvent(name);
  }
}
