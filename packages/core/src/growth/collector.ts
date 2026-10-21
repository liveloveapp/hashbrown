import { DevelopmentAnnouncements } from './announcements';
import { DevelopmentSession } from './session';
import {
  type DevelopmentCollectionDiagnostics,
  type DevelopmentMilestone,
  ENDPOINT,
  MAX_AGE,
  type RuntimeEvent,
  type RuntimeOwner,
} from './types';

/** Minimum spacing between requests, in milliseconds. */
const MIN_INTERVAL = 10_000;
/** Minimum spacing between replayed exchange envelopes, in milliseconds. */
const ACTIVE_INTERVAL = 300_000;
/** Request deadline, in milliseconds. */
const DEADLINE = 3_000;
/** Delivery attempts per event. */
const ATTEMPTS = 3;
/** Maximum events waiting for delivery. */
const MAX_PENDING = 50;
/** Maximum events per request. */
const MAX_BATCH = 20;
/** Maximum acknowledgment body size, in bytes (32 KiB). */
const MAX_RESPONSE = 32_768;
/** Largest delay `setTimeout` accepts. */
const MAX_DELAY = 2_147_483_647;
const DISPOSITIONS = ['accepted', 'duplicate', 'redacted'] as const;

type Disposition = (typeof DISPOSITIONS)[number];

interface Pending {
  event: RuntimeEvent;
  owner: RuntimeOwner;
  attempts: number;
  nextAt: number;
  acknowledged?: boolean;
}

interface Acknowledgment {
  readonly events: readonly {
    readonly eventId: string;
    readonly disposition: Disposition;
  }[];
  readonly announcements?: unknown;
}

type Timer = ReturnType<typeof setTimeout>;

/** Dependencies {@link DevelopmentCollector} uses; each defaults to the global. */
export interface DevelopmentCollectorDependencies {
  /** Fetch implementation for the runtime endpoint. */
  fetch?: typeof fetch;
  /** Current time in epoch milliseconds. */
  now?: () => number;
  /** Schedules a callback. */
  setTimeout?: (callback: () => void, ms: number) => Timer;
  /** Cancels a scheduled callback. */
  clearTimeout?: (timer: Timer) => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/**
 * Parses an acknowledgment of exactly
 * `{ schemaVersion: 1, events: [{ eventId, disposition }], announcements? }`
 * that answers only events of the batch, each at most once.
 *
 * @param value - Untrusted parsed response body.
 * @param batch - Events the request carried.
 * @returns The acknowledgment, or undefined when it is invalid.
 */
function acknowledgment(
  value: unknown,
  batch: readonly Pending[],
): Acknowledgment | undefined {
  if (
    !record(value) ||
    !onlyKeys(value, ['schemaVersion', 'events', 'announcements']) ||
    value['schemaVersion'] !== 1 ||
    !Array.isArray(value['events']) ||
    value['events'].length > batch.length
  )
    return undefined;
  const ids = new Set(batch.map((pending) => pending.event.eventId));
  const seen = new Set<string>();
  const events: Acknowledgment['events'][number][] = [];
  for (const ack of value['events'] as unknown[]) {
    if (
      !record(ack) ||
      !onlyKeys(ack, ['eventId', 'disposition']) ||
      typeof ack['eventId'] !== 'string' ||
      !ids.has(ack['eventId']) ||
      seen.has(ack['eventId']) ||
      !DISPOSITIONS.includes(ack['disposition'] as Disposition)
    )
      return undefined;
    seen.add(ack['eventId']);
    events.push({
      eventId: ack['eventId'],
      disposition: ack['disposition'] as Disposition,
    });
  }
  return { events, announcements: value['announcements'] };
}

/**
 * Bucket for a first stream's duration: below 1 s, 1–5 s, 5–30 s, or 30 s and
 * more.
 *
 * @param durationMs - Duration in milliseconds.
 * @returns The bucket, or undefined for a missing or invalid duration.
 */
function durationBucket(durationMs: number | undefined): string | undefined {
  if (
    durationMs === undefined ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  )
    return undefined;
  if (durationMs < 1_000) return 'lt_1s';
  if (durationMs < 5_000) return '1s_to_5s';
  if (durationMs < 30_000) return '5s_to_30s';
  return '30s_plus';
}

/**
 * Page-local queue and transport for development runtime events. All work is
 * bounded: at most {@link MAX_PENDING} pending events, {@link MAX_BATCH} per
 * request, one request in flight, ten seconds between requests, three
 * attempts per event and a three second deadline. Nothing is sent while idle.
 * Framework packages perform the development-build and opt-out gating; every
 * owner's `allowed()` is consulted again before anything is queued or sent.
 */
export class DevelopmentCollector {
  private readonly session = new DevelopmentSession();
  private readonly announcements = new DevelopmentAnnouncements();
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => Timer;
  private readonly clearTimer: (timer: Timer) => void;
  private pending: Pending[] = [];
  private readonly latest = new Map<string, RuntimeEvent>();
  private readonly initialized = new Map<string, Pending>();
  private timer?: Timer;
  private inFlight?: { controller: AbortController; batch: Pending[] };
  private lastRequest = -Infinity;
  private nextAllowed = 0;
  private generation = 0;
  private readonly counts = { discarded: 0, failures: 0, acknowledged: 0 };

  /**
   * @param dependencies - Optional replacements for `fetch`, the clock and the
   * timer functions, for tests. Each defaults to the global.
   */
  constructor(dependencies: DevelopmentCollectorDependencies = {}) {
    this.fetch =
      dependencies.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = dependencies.now ?? (() => Date.now());
    this.setTimer =
      dependencies.setTimeout ??
      ((callback, ms) => globalThis.setTimeout(callback, ms));
    this.clearTimer =
      dependencies.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer));
  }

  /**
   * Returns the delivery counters.
   *
   * @returns A snapshot of the counters and the pending event count.
   */
  diagnostics(): DevelopmentCollectionDiagnostics {
    return { ...this.counts, pending: this.pending.length };
  }

  /** Cancels the scheduled and in-flight requests and forgets every queued event. */
  clear(): void {
    this.generation++;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.inFlight?.controller.abort();
    this.inFlight = undefined;
    this.pending = [];
    this.latest.clear();
    this.initialized.clear();
  }

  /**
   * Drops events whose owner no longer allows collection, and discards events
   * older than {@link MAX_AGE} or out of attempts. Aborts the in-flight request
   * when none of its owners allow collection any more.
   */
  prune(): void {
    const now = this.now();
    this.pending = this.pending.filter((pending) => {
      if (!pending.owner.allowed()) return false;
      if (
        now - Date.parse(pending.event.occurredAt) >= MAX_AGE ||
        (pending.attempts >= ATTEMPTS &&
          !this.inFlight?.batch.includes(pending))
      ) {
        this.counts.discarded++;
        return false;
      }
      return true;
    });
    for (const [key, event] of this.latest)
      if (now - Date.parse(event.occurredAt) >= MAX_AGE)
        this.latest.delete(key);
    if (this.inFlight?.batch.every((pending) => !pending.owner.allowed()))
      this.inFlight.controller.abort();
  }

  /**
   * Records activity for an owner: queues its session start once per session
   * and, when given, a first-time milestone. With nothing queued, an active
   * owner replays its last acknowledged event as the exchange envelope at most
   * once per five minutes; no new activity is invented.
   *
   * @param owner - The runtime owner reporting activity.
   * @param kind - Milestone reached, if any.
   * @param durationMs - Duration of the first stream, for
   * `runtime.first_stream_completed`.
   */
  touch(
    owner: RuntimeOwner,
    kind?: DevelopmentMilestone,
    durationMs?: number,
  ): void {
    if (!owner.allowed()) {
      this.prune();
      return;
    }
    const now = this.now();
    const transport = owner.transport();
    const { options } = owner;
    const installationToken = options.installationToken || undefined;
    const identity = this.session.touch(now);
    const initialization = this.session.initialization(
      options,
      transport,
      identity,
      now,
    );
    const enqueue = (eventKind: DevelopmentMilestone) => {
      if (!this.session.claim(`${options.integration}:${eventKind}`)) return;
      const bucket =
        eventKind === 'runtime.first_stream_completed'
          ? durationBucket(durationMs)
          : undefined;
      this.pending.push({
        owner,
        attempts: 0,
        nextAt: now,
        event: {
          eventId: window.crypto.randomUUID(),
          kind: eventKind,
          occurredAt: new Date(now).toISOString(),
          collectorVersion: '1',
          ...(installationToken ? { installationToken } : {}),
          ...identity,
          properties: {
            integration: options.integration,
            packageName: options.packageName,
            packageVersion: options.packageVersion,
            transport,
            ...(bucket ? { durationBucket: bucket } : {}),
          },
        },
      });
    };
    this.prune();
    let initial = this.initialized.get(options.integration);
    if (!initial || initial.event.eventId !== initialization.eventId) {
      initial = { event: initialization, owner, attempts: 0, nextAt: now };
      this.initialized.set(options.integration, initial);
    }
    initial.owner = owner;
    if (
      !initial.acknowledged &&
      initial.attempts < ATTEMPTS &&
      !this.pending.includes(initial)
    )
      this.pending.push(initial);
    if (kind) enqueue(kind);
    const latest = this.latest.get(options.integration);
    if (
      !this.pending.length &&
      latest &&
      latest.sessionId === identity.sessionId &&
      latest.properties['packageVersion'] === options.packageVersion &&
      latest.installationToken === installationToken &&
      now - this.lastRequest >= ACTIVE_INTERVAL
    ) {
      // Replay a committed event solely as the nonempty exchange envelope.
      this.pending.push({ event: latest, owner, attempts: 0, nextAt: now });
    }
    if (this.pending.length > MAX_PENDING) {
      this.counts.discarded += this.pending.length - MAX_PENDING;
      this.pending.splice(0, this.pending.length - MAX_PENDING);
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined || this.inFlight || !this.pending.length)
      return;
    const at = Math.max(
      this.lastRequest + MIN_INTERVAL,
      this.nextAllowed,
      Math.min(...this.pending.map((pending) => pending.nextAt)),
    );
    this.timer = this.setTimer(
      () => {
        this.timer = undefined;
        void this.send();
      },
      Math.min(MAX_DELAY, Math.max(0, at - this.now())),
    );
  }

  private async send(): Promise<void> {
    this.prune();
    const batch = this.pending
      .filter((pending) => pending.nextAt <= this.now())
      .slice(0, MAX_BATCH);
    if (!batch.length) {
      this.schedule();
      return;
    }
    const generation = this.generation;
    const controller = new AbortController();
    this.inFlight = { controller, batch };
    this.lastRequest = this.now();
    for (const pending of batch) pending.attempts++;
    let deadline: Timer | undefined;
    try {
      const body = await Promise.race([
        this.exchange(batch, controller),
        new Promise<never>((_, reject) => {
          deadline = this.setTimer(() => {
            controller.abort();
            reject(new Error('timeout'));
          }, DEADLINE);
        }),
      ]);
      if (generation !== this.generation || controller.signal.aborted) return;
      const result = acknowledgment(body, batch);
      if (!result) throw new Error('invalid_ack');
      const allowed = batch.filter((pending) => pending.owner.allowed());
      const dispositions = new Map(
        result.events.map((ack) => [ack.eventId, ack.disposition]),
      );
      for (const pending of allowed) {
        const disposition = dispositions.get(pending.event.eventId);
        if (!disposition) continue;
        pending.acknowledged = true;
        this.counts.acknowledged++;
        if (disposition !== 'redacted')
          this.latest.set(
            pending.event.properties['integration'],
            pending.event,
          );
      }
      const committed = new Set(
        allowed
          .filter((pending) => dispositions.has(pending.event.eventId))
          .map((pending) => pending.event.eventId),
      );
      this.pending = this.pending.filter(
        (pending) => !committed.has(pending.event.eventId),
      );
      // Display is deliberately independent of acknowledgment processing.
      if (allowed.length)
        this.announcements.display(
          result.announcements,
          allowed.map((pending) => pending.event),
        );
    } catch {
      if (generation === this.generation) this.counts.failures++;
    } finally {
      if (deadline !== undefined) this.clearTimer(deadline);
      controller.abort();
      if (generation === this.generation) {
        for (const pending of batch)
          pending.nextAt = Math.max(
            this.nextAllowed,
            this.lastRequest + MIN_INTERVAL * 2 ** (pending.attempts - 1),
          );
        this.inFlight = undefined;
        this.prune();
        this.schedule();
      }
    }
  }

  private retryAfter(raw: string | null): void {
    if (!raw) return;
    const until = /^\d+$/u.test(raw)
      ? this.now() + Number(raw) * 1_000
      : Date.parse(raw);
    if (Number.isFinite(until))
      this.nextAllowed = Math.max(this.nextAllowed, until);
  }

  private async exchange(
    batch: Pending[],
    controller: AbortController,
  ): Promise<unknown> {
    const response = await this.fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        events: batch.map((pending) => pending.event),
      }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error('cancelled');
    }
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500)
        this.retryAfter(response.headers.get('Retry-After'));
      else for (const pending of batch) pending.attempts = ATTEMPTS;
      void response.body?.cancel().catch(() => undefined);
      throw new Error('response');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty_response');
    const abort = () => {
      void reader.cancel().catch(() => undefined);
    };
    controller.signal.addEventListener('abort', abort, { once: true });
    try {
      let bytes = 0;
      let content = '';
      const decoder = new TextDecoder();
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_RESPONSE) throw new Error('response_limit');
        content += decoder.decode(part.value, { stream: true });
      }
      return JSON.parse(content + decoder.decode()) as unknown;
    } finally {
      controller.signal.removeEventListener('abort', abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
