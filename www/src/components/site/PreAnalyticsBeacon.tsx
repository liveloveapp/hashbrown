import { preAnalyticsBeaconScript } from '../../lib/analytics/pre-analytics-beacon';

/**
 * Inlines the pre-analytics exit beacon (lib/analytics/pre-analytics-beacon.ts)
 * so it is armed while the HTML is still parsing — before any bundle, and
 * without a request of its own to compete with page assets.
 *
 * Renders nothing without a PostHog token, matching instrumentation-client.ts,
 * which never initializes PostHog without one either.
 */
export function PreAnalyticsBeacon() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
  if (!token) return null;
  const captureLocal = process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL === 'true';
  return (
    <script
      data-pre-analytics-beacon=""
      dangerouslySetInnerHTML={{
        __html: preAnalyticsBeaconScript({ token, captureLocal }),
      }}
    />
  );
}
