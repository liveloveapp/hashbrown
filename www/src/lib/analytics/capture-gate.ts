/**
 * Decides whether website analytics may capture, shared by
 * `instrumentation-client.ts`. The pre-analytics beacon carries its own copy of
 * this rule because it runs before any bundle loads; keep them identical.
 */

/** The inputs to {@link shouldCaptureAnalytics}. */
export type CaptureConfig = {
  token?: string;
  captureLocal?: boolean;
  host?: string;
};

function toSafeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Whether `host` is a loopback host (`localhost`, `127.0.0.1`, `::1`, with or
 * without a port).
 */
export function isLocalAnalyticsHost(host: unknown): boolean {
  const value = toSafeString(host, 300)?.toLowerCase();
  if (!value) return false;

  // IPv6 literal `::1` or `[::1]:port` — don't naively split on `:`.
  if (value === '::1' || value.startsWith('[::1]')) return true;

  const hostname = value.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Whether analytics should capture: a token is required, and loopback hosts
 * additionally need the explicit `captureLocal` opt-in.
 */
export function shouldCaptureAnalytics({
  token,
  captureLocal = false,
  host,
}: CaptureConfig): boolean {
  if (!toSafeString(token, 500)) return false;
  if (isLocalAnalyticsHost(host) && !captureLocal) return false;
  return true;
}
