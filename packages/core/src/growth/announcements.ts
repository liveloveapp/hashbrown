import { PACKAGE_NAMES, type RuntimeEvent } from './types';

const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DOCUMENTATION_URL =
  /^https:\/\/hashbrown\.dev\/docs(?:\/[a-zA-Z0-9._~-]+)*\/?$/;
const STORAGE_PREFIX = 'hashbrown.growth.announcements.v1:';
const REMEMBERED = 100;

interface Announcement {
  readonly id: string;
  readonly text: string;
  readonly documentationUrl?: string;
}

function version(value: unknown): number[] | undefined {
  if (typeof value !== 'string' || value.length > 64 || !RELEASE.test(value))
    return undefined;
  const result = value.split('.').map(Number);
  return result.every(Number.isSafeInteger) ? result : undefined;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function publicText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 500 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10) || code === 127;
    })
  );
}

/**
 * Validates one announcement from an acknowledgment against the events it
 * answers.
 *
 * @param item - Untrusted announcement data.
 * @param events - Events the acknowledgment covered.
 * @param now - Current time in epoch milliseconds.
 * @returns The announcement to print, or undefined when it does not apply.
 */
function applicable(
  item: unknown,
  events: readonly RuntimeEvent[],
  now: number,
): Announcement | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const candidate = item as Record<string, unknown>;
  const { id, text, expiresAt, packageNames, documentationUrl } = candidate;
  if (typeof id !== 'string' || !ID.test(id) || !publicText(text))
    return undefined;
  if (
    typeof expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= now
  )
    return undefined;
  if (
    !Array.isArray(packageNames) ||
    packageNames.length > PACKAGE_NAMES.length ||
    !packageNames.every(
      (name) => typeof name === 'string' && PACKAGE_NAMES.includes(name),
    )
  )
    return undefined;
  const min = version(candidate['minVersion']);
  const max =
    candidate['maxVersion'] === undefined
      ? undefined
      : version(candidate['maxVersion']);
  if (!min || (candidate['maxVersion'] !== undefined && !max)) return undefined;
  const matches = events.some((event) => {
    const actual = version(event.properties['packageVersion']);
    return (
      packageNames.includes(event.properties['packageName']) &&
      actual !== undefined &&
      compare(actual, min) >= 0 &&
      (!max || compare(actual, max) < 0)
    );
  });
  if (!matches) return undefined;
  if (
    documentationUrl !== undefined &&
    (typeof documentationUrl !== 'string' ||
      documentationUrl.length > 300 ||
      !DOCUMENTATION_URL.test(documentationUrl))
  )
    return undefined;
  return {
    id,
    text,
    ...(documentationUrl ? { documentationUrl } : {}),
  };
}

/**
 * Prints announcements returned with a runtime acknowledgment to the console,
 * once per announcement id per browser identity. Remote text is console data
 * only: it never becomes a format string, HTML, or executable code.
 */
export class DevelopmentAnnouncements {
  private identity?: string;
  private seen: readonly string[] = [];

  /**
   * Validates and prints the announcements that apply to the given events.
   * Never throws.
   *
   * @param input - Untrusted `announcements` value from the acknowledgment.
   * @param events - Events the acknowledgment covered.
   */
  display(input: unknown, events: RuntimeEvent[]): void {
    try {
      this.displaySafely(input, events);
    } catch {
      /* A committed acknowledgment is independent of display. */
    }
  }

  private remember(key: string, id: string): void {
    this.seen = [...this.seen.filter((seen) => seen !== id), id].slice(
      -REMEMBERED,
    );
    try {
      window.localStorage.setItem(key, JSON.stringify(this.seen));
    } catch {
      /* Page memory still deduplicates when persistence is blocked. */
    }
  }

  private displaySafely(input: unknown, events: RuntimeEvent[]): void {
    if (!Array.isArray(input) || input.length > 5 || !events.length) return;
    const identity = events[0].subject.id;
    const key = `${STORAGE_PREFIX}${identity}`;
    if (this.identity !== identity) {
      this.identity = identity;
      this.seen = [];
    }
    try {
      const raw = window.localStorage.getItem(key);
      const saved: unknown = raw && raw.length <= 8500 ? JSON.parse(raw) : [];
      if (
        Array.isArray(saved) &&
        saved.length <= REMEMBERED &&
        saved.every((id) => typeof id === 'string' && ID.test(id))
      ) {
        this.seen = [...new Set([...this.seen, ...saved])].slice(-REMEMBERED);
      }
    } catch {
      /* Page memory still deduplicates when persistence is blocked. */
    }
    const now = Date.now();
    for (const item of input) {
      const announcement = applicable(item, events, now);
      if (!announcement || this.seen.includes(announcement.id)) continue;
      // Remember before printing: repeated blocked console calls must not become a retry loop.
      this.remember(key, announcement.id);
      try {
        console.info(
          '[Hashbrown] %s',
          announcement.text +
            (announcement.documentationUrl
              ? `\n${announcement.documentationUrl}`
              : ''),
        );
      } catch {
        /* Console availability cannot change ingestion. */
      }
    }
  }
}
