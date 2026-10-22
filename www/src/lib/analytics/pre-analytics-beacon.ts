/**
 * The pre-analytics exit beacon: records visitors who leave before PostHog has
 * initialized.
 *
 * posthog-js arrives in a ~60KB chunk that shares the connection with
 * everything else on first load. Measured on production with Lighthouse mobile
 * and devtools throttling, it finished downloading at ~4.2s and sent its first
 * event — the `$pageview` — at ~4.5s. A visitor on a slow connection who
 * leaves before that is never recorded at all, so every PostHog figure for
 * short mobile visits (bounce rate, session length) is computed only from
 * visitors whose connections were fast enough. This measures that missing
 * cohort.
 *
 * It sends a custom event, deliberately not a `$pageview`: it does not pretend
 * to be posthog-js, so it cannot corrupt web-analytics sessions or bounce rate.
 * No person profile is created and no IP is kept.
 *
 * Wiring: app/layout.tsx inlines {@link preAnalyticsBeaconScript} as the first
 * thing in <body>, so it is armed before any bundle loads and costs no request.
 * instrumentation-client.ts disarms it the moment posthog.init() runs — from
 * then on posthog-js owns the session and flushes its own events on unload —
 * and also when its own gate declines, so the two can never both report.
 */

/** Configuration embedded in the inline beacon script. */
export interface PreAnalyticsBeaconConfig {
  /** NEXT_PUBLIC_POSTHOG_TOKEN. Public by design; it is in every page's JS. */
  readonly token: string;
  /** NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL === 'true'. */
  readonly captureLocal: boolean;
}

/**
 * The event name the beacon sends. The literal in installPreAnalyticsBeacon
 * below is tested equal to this.
 */
export const PRE_ANALYTICS_EVENT = 'marketing:pre_analytics_exit';

/** The window property holding the beacon's `disarm()` handle. */
export const PRE_ANALYTICS_GLOBAL = '__hashbrownPreAnalytics';

/** The handle `instrumentation-client.ts` uses to stand the beacon down. */
export interface PreAnalyticsBeaconHandle {
  disarm(): void;
}

declare global {
  interface Window {
    __hashbrownPreAnalytics?: PreAnalyticsBeaconHandle;
  }
}

/**
 * Arms the beacon.
 *
 * MUST be self-contained. It is serialized with Function.prototype.toString
 * and inlined into the HTML, so it may reference nothing outside its own body:
 * no imports, no module constants, no helpers. That is why the event name, the
 * global's name and the local-host rule are written out literally here. The
 * spec evaluates the serialized string on its own to enforce this, and a gate
 * parity table keeps the local-host rule identical to shouldCaptureAnalytics.
 */
export function installPreAnalyticsBeacon(
  config: PreAnalyticsBeaconConfig,
): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__hashbrownPreAnalytics) return;

  // Mirror of shouldCaptureAnalytics / isLocalAnalyticsHost in
  // capture-gate.ts. Keep them identical.
  const host = String(location.host || '').toLowerCase();
  const isLocal =
    host === '::1' ||
    host.indexOf('[::1]') === 0 ||
    host.split(':')[0] === 'localhost' ||
    host.split(':')[0] === '127.0.0.1';
  if (!config.token || (isLocal && !config.captureLocal)) return;

  let armed = true;

  function send(trigger: 'pagehide' | 'visibilitychange') {
    if (!armed) return;
    armed = false;
    removeListeners();
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string };
    };
    if (typeof nav.sendBeacon !== 'function') return;
    let referrerHost: string | null = null;
    try {
      referrerHost = document.referrer ? new URL(document.referrer).host : null;
    } catch {
      referrerHost = null;
    }
    const distinctId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'pre-' +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2);
    const body = JSON.stringify({
      api_key: config.token,
      event: 'marketing:pre_analytics_exit',
      distinct_id: distinctId,
      timestamp: new Date().toISOString(),
      properties: {
        $process_person_profile: false,
        $lib: 'hashbrown-pre-analytics-beacon',
        // Milliseconds since navigation start: how long the visitor stayed.
        elapsed_ms: Math.round(performance.now()),
        // 'pagehide' is a definite leave. 'visibilitychange' (to hidden) is how a phone usually
        // leaves (app switch, tab switch), but the visitor may come back.
        trigger: trigger,
        // Pathname only: the query string can carry anything a link put there.
        source_page: location.pathname,
        referrer_host: referrerHost,
        viewport_width: window.innerWidth,
        // Chromium only; null on Safari and Firefox.
        effective_type:
          (nav.connection && nav.connection.effectiveType) || null,
      },
    });
    try {
      // Same proxy, content type and IP-less capture posthog-js uses for its
      // own unload beacons.
      nav.sendBeacon(
        '/_/ingest/i/v0/e/?ip=0&beacon=1',
        new Blob([body], { type: 'application/json' }),
      );
    } catch {
      // Leaving the page must never throw.
    }
  }

  function onPageHide() {
    send('pagehide');
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') send('visibilitychange');
  }
  function removeListeners() {
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
  w.__hashbrownPreAnalytics = {
    disarm: function () {
      armed = false;
      removeListeners();
    },
  };
}

/**
 * The inline <script> body. `<` is escaped in the embedded config so no value
 * can close the script element early.
 */
export function preAnalyticsBeaconScript(
  config: PreAnalyticsBeaconConfig,
): string {
  const safeConfig = JSON.stringify(config).replace(/</g, '\\u003c');
  return `(${installPreAnalyticsBeacon.toString()})(${safeConfig});`;
}
