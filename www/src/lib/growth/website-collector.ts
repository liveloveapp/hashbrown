/**
 * The website collector: one `website.session_started` per 30-minute session
 * and one `website.content_viewed` per pathname per session, posted to the
 * first-party collection route. It never throws into the page and never sends
 * anything unless collection is enabled.
 */
import { isLocalAnalyticsHost } from '../analytics/capture-gate';
import {
  acquisitionProperties,
  contentIdFor,
  websiteTopic,
} from './website-metadata';

/** The collection route for the website source. */
export const WEBSITE_COLLECT_PATH = '/_/growth/collect/v1/website';
/** Inactivity after which a session ends. */
export const SESSION_WINDOW_MS = 30 * 60 * 1000;
/** How long events coalesce before a batch is sent. */
export const COALESCE_MS = 1000;
/** Most events in one batch (the route's limit). */
export const MAX_BATCH_EVENTS = 20;
/** localStorage key of the browser subject id. */
export const SUBJECT_STORAGE_KEY = 'hashbrown.growth.subject';
/** sessionStorage key of the session record. */
export const SESSION_STORAGE_KEY = 'hashbrown.growth.session';

const MAX_RETRY_AFTER_MS = 60_000;
const MAX_SEEN = 200;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** The slice of the Web Storage API the collector uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A batch body as the route expects it. */
export interface WebsiteBatch {
  schemaVersion: 1;
  events: WebsiteEvent[];
}

/** One event as sent on the wire. */
export interface WebsiteEvent {
  eventId: string;
  kind: 'website.session_started' | 'website.content_viewed';
  occurredAt: string;
  collectorVersion: string;
  subject: {
    id: string;
    namespace: 'website_session';
    scope: 'persistent' | 'session' | 'memory';
  };
  sessionId: string;
  properties: Record<string, string>;
}

/** What a send reports back; a thrown error counts as a dropped batch. */
export interface WebsiteDelivery {
  status: number;
  retryAfterMs?: number;
}

/** Dependencies of {@link createWebsiteCollector}. */
export interface WebsiteCollectorDeps {
  /** Whether collection may run at all. */
  enabled: boolean;
  /** Sends one batch. */
  post(batch: WebsiteBatch): Promise<WebsiteDelivery>;
  /** The current time. */
  now(): Date;
  /** Storage for the subject id (`local`) and the session (`session`). */
  storage: { local?: StorageLike; session?: StorageLike };
  /** Creates a UUID v4. */
  subjectIdFactory(): string;
  /** Reported as `collectorVersion`; must match `^[0-9A-Za-z._+-]{1,64}$`. */
  collectorVersion?: string;
  /** The page's `location.search` and `document.referrer`. */
  context?(): { search: string; referrer: string };
}

/** The collector's surface. */
export interface WebsiteCollector {
  /** Records the page the visitor is on; safe to call on every navigation. */
  observePath(pathname: string): void;
  /** Sends everything queued now. */
  flush(): Promise<void>;
  /**
   * For `pagehide`: starts every queued chunk's post immediately, ignoring any
   * in-flight rate-limit wait, and without retrying.
   */
  flushOnHide(): void;
}

interface SessionRecord {
  id: string;
  last: number;
  seen: string[];
}

function guard<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Creates a website collector.
 *
 * @param deps - Injected effects; see {@link WebsiteCollectorDeps}.
 */
export function createWebsiteCollector(
  deps: WebsiteCollectorDeps,
): WebsiteCollector {
  const version = deps.collectorVersion || 'www-dev';
  let queue: Omit<WebsiteEvent, 'occurredAt'>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending: Promise<void> = Promise.resolve();
  let memorySubject: string | undefined;
  let memorySession: SessionRecord | undefined;
  let sessionStorageWorks = true;
  let acquisitionSent = false;

  function subject(): WebsiteEvent['subject'] {
    const local = deps.storage.local;
    const stored = local && guard(() => local.getItem(SUBJECT_STORAGE_KEY));
    if (stored && UUID_V4.test(stored))
      return { id: stored, namespace: 'website_session', scope: 'persistent' };
    const id = memorySubject ?? deps.subjectIdFactory();
    memorySubject = id;
    if (local && guard(() => (local.setItem(SUBJECT_STORAGE_KEY, id), true)))
      return { id, namespace: 'website_session', scope: 'persistent' };
    const session = deps.storage.session;
    const key = `${SUBJECT_STORAGE_KEY}.session`;
    const fallback = session && guard(() => session.getItem(key));
    if (fallback && UUID_V4.test(fallback))
      return {
        id: fallback,
        namespace: 'website_session',
        scope: 'session',
      };
    if (session && guard(() => (session.setItem(key, id), true)))
      return { id, namespace: 'website_session', scope: 'session' };
    return { id, namespace: 'website_session', scope: 'memory' };
  }

  function readSession(): SessionRecord | undefined {
    const storage = deps.storage.session;
    if (storage && sessionStorageWorks) {
      const raw = guard(() => storage.getItem(SESSION_STORAGE_KEY));
      const parsed = raw ? guard(() => JSON.parse(raw) as unknown) : undefined;
      const record = parsed as Partial<SessionRecord> | undefined;
      if (
        record &&
        typeof record.id === 'string' &&
        UUID_V4.test(record.id) &&
        typeof record.last === 'number' &&
        Array.isArray(record.seen)
      )
        return {
          id: record.id,
          last: record.last,
          seen: record.seen.filter((s): s is string => typeof s === 'string'),
        };
    }
    return memorySession;
  }

  function writeSession(record: SessionRecord) {
    memorySession = record;
    const storage = deps.storage.session;
    if (!storage) return;
    sessionStorageWorks =
      guard(
        () => (
          storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record)),
          true
        ),
      ) === true;
  }

  function enqueue(
    sessionId: string,
    kind: WebsiteEvent['kind'],
    properties: Record<string, string>,
  ) {
    queue.push({
      eventId: deps.subjectIdFactory(),
      kind,
      collectorVersion: version,
      subject: subject(),
      sessionId,
      properties,
    });
  }

  function schedule() {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, COALESCE_MS);
  }

  async function sendOne(events: Omit<WebsiteEvent, 'occurredAt'>[]) {
    const batch: WebsiteBatch = {
      schemaVersion: 1,
      events: events.map((event) => ({
        ...event,
        occurredAt: deps.now().toISOString(),
      })),
    };
    try {
      const result = await deps.post(batch);
      if (result.status !== 429) return;
      const wait = Math.min(
        Math.max(result.retryAfterMs ?? 1000, 0),
        MAX_RETRY_AFTER_MS,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      await deps.post({
        schemaVersion: 1,
        events: events.map((event) => ({
          ...event,
          occurredAt: deps.now().toISOString(),
        })),
      });
    } catch {
      // Dropped silently: analytics never interrupts the page.
    }
  }

  function takeChunks(): Omit<WebsiteEvent, 'occurredAt'>[][] {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const pending = queue;
    queue = [];
    const chunks: (typeof pending)[] = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH_EVENTS)
      chunks.push(pending.slice(i, i + MAX_BATCH_EVENTS));
    return chunks;
  }

  function flushOnHide() {
    for (const chunk of takeChunks()) {
      void guard(() =>
        deps
          .post({
            schemaVersion: 1,
            events: chunk.map((event) => ({
              ...event,
              occurredAt: deps.now().toISOString(),
            })),
          })
          .catch(() => undefined),
      );
    }
  }

  function flush(): Promise<void> {
    const chunks = takeChunks();
    if (!chunks.length) return sending;
    sending = sending.then(async () => {
      for (const chunk of chunks) await sendOne(chunk);
    });
    return sending;
  }

  return {
    observePath(pathname) {
      if (!deps.enabled) return;
      guard(() => {
        const now = deps.now().getTime();
        let session = readSession();
        if (!session || now - session.last > SESSION_WINDOW_MS) {
          session = { id: deps.subjectIdFactory(), last: now, seen: [] };
          const context = deps.context?.() ?? { search: '', referrer: '' };
          // Acquisition describes the page load's arrival, not a renewal.
          enqueue(
            session.id,
            'website.session_started',
            acquisitionSent
              ? {}
              : acquisitionProperties(context.search, context.referrer),
          );
          acquisitionSent = true;
        }
        const contentId = contentIdFor(pathname);
        const topic = websiteTopic(pathname);
        const seen =
          contentId && topic !== 'other' && !session.seen.includes(contentId)
            ? [...session.seen, contentId].slice(-MAX_SEEN)
            : session.seen;
        if (contentId && topic !== 'other' && seen !== session.seen)
          enqueue(session.id, 'website.content_viewed', { contentId, topic });
        writeSession({ ...session, last: now, seen });
        if (queue.length) schedule();
      });
    },
    flush,
    flushOnHide,
  };
}

/**
 * Whether the browser may collect: the build flag, a non-local host, and no
 * opt-out (`window.__HASHBROWN_TELEMETRY_DISABLED__`,
 * `localStorage.HASHBROWN_TELEMETRY_DISABLED`, `navigator.webdriver`).
 *
 * @param flag - `NEXT_PUBLIC_GROWTH_COLLECTION`.
 */
export function isWebsiteCollectionEnabled(flag: string | undefined): boolean {
  if (flag !== 'true' || typeof window === 'undefined') return false;
  if (isLocalAnalyticsHost(window.location.host)) return false;
  const win = window as { __HASHBROWN_TELEMETRY_DISABLED__?: unknown };
  if (win.__HASHBROWN_TELEMETRY_DISABLED__) return false;
  if (guard(() => window.localStorage.getItem('HASHBROWN_TELEMETRY_DISABLED')))
    return false;
  if (navigator.webdriver) return false;
  return true;
}

/**
 * Posts one batch with a 3 s timeout and `keepalive`.
 *
 * @param batch - The batch body.
 * @param fetcher - Injectable `fetch`.
 */
export async function sendWebsiteBatch(
  batch: WebsiteBatch,
  fetcher: typeof fetch = fetch,
): Promise<WebsiteDelivery> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetcher(WEBSITE_COLLECT_PATH, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
      signal: controller.signal,
    });
    const retry = Number(response.headers.get('retry-after'));
    return {
      status: response.status,
      ...(Number.isFinite(retry) && retry > 0
        ? { retryAfterMs: retry * 1000 }
        : {}),
    };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

let installed: WebsiteCollector | undefined;

/**
 * The browser's collector: created on first use from the environment, or
 * `undefined` when collection is off. One per page load: the singleton guard
 * registers the `pagehide` flush exactly once, and the listener lives as long
 * as the page does, so there is deliberately no uninstall.
 */
export function installWebsiteCollector(): WebsiteCollector | undefined {
  if (installed) return installed;
  if (!isWebsiteCollectionEnabled(process.env.NEXT_PUBLIC_GROWTH_COLLECTION))
    return undefined;
  const collector = createWebsiteCollector({
    enabled: true,
    post: (batch) => sendWebsiteBatch(batch),
    now: () => new Date(),
    storage: {
      local: guard(() => window.localStorage),
      session: guard(() => window.sessionStorage),
    },
    subjectIdFactory: () => crypto.randomUUID(),
    collectorVersion: process.env.NEXT_PUBLIC_WWW_VERSION,
    context: () => ({
      search: window.location.search,
      referrer: document.referrer,
    }),
  });
  window.addEventListener('pagehide', () => collector.flushOnHide());
  installed = collector;
  return installed;
}
