import {
  type DevelopmentIntegration,
  type DevelopmentStartOptions,
  type DevelopmentTransportKind,
  MAX_AGE,
  MILESTONES,
  type RuntimeEvent,
  SESSION_IDLE,
  UUID,
  VERSION,
} from './types';

const IDENTITY_KEY = 'hashbrown.growth.browser.v1';
const SESSION_KEY = 'hashbrown.growth.session.v1';
const INTEGRATIONS: readonly DevelopmentIntegration[] = ['react', 'angular'];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface Start {
  readonly installationToken?: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly packageVersion: string;
}

interface Session {
  readonly id: string;
  readonly subjectId: string;
  readonly lastActive: number;
  readonly seen: readonly string[];
  readonly starts: Readonly<Partial<Record<DevelopmentIntegration, Start>>>;
}

/** Identity returned by {@link DevelopmentSession.touch}. */
export interface DevelopmentIdentity {
  /** Random browser identity. */
  subject: RuntimeEvent['subject'];
  /** Random session identifier. */
  sessionId: string;
}

const validKeys = new Set(
  INTEGRATIONS.flatMap((integration) =>
    ['runtime.session_started', ...MILESTONES].map(
      (kind) => `${integration}:${kind}`,
    ),
  ),
);

function token(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

function validStart(start: unknown, now: number): Start | undefined {
  if (!start || typeof start !== 'object') return undefined;
  const candidate = start as Partial<Record<keyof Start, unknown>>;
  if (
    typeof candidate.eventId !== 'string' ||
    !UUID.test(candidate.eventId) ||
    typeof candidate.occurredAt !== 'string' ||
    !TIMESTAMP.test(candidate.occurredAt) ||
    Date.parse(candidate.occurredAt) > now ||
    now - Date.parse(candidate.occurredAt) >= MAX_AGE ||
    typeof candidate.packageVersion !== 'string' ||
    candidate.packageVersion.length > 64 ||
    !VERSION.test(candidate.packageVersion) ||
    (candidate.installationToken !== undefined &&
      (typeof candidate.installationToken !== 'string' ||
        !UUID.test(candidate.installationToken)))
  )
    return undefined;
  return {
    eventId: candidate.eventId,
    occurredAt: candidate.occurredAt,
    packageVersion: candidate.packageVersion,
    ...(candidate.installationToken
      ? { installationToken: candidate.installationToken }
      : {}),
  };
}

function validSession(
  raw: string | null,
  subjectId: string,
  now: number,
): Session | undefined {
  if (!raw || raw.length > 4096) return undefined;
  try {
    const candidate = JSON.parse(raw) as Partial<
      Record<keyof Session, unknown>
    >;
    if (
      !candidate ||
      typeof candidate.id !== 'string' ||
      !UUID.test(candidate.id) ||
      candidate.subjectId !== subjectId ||
      typeof candidate.lastActive !== 'number' ||
      !Number.isFinite(candidate.lastActive) ||
      candidate.lastActive > now ||
      now - candidate.lastActive >= SESSION_IDLE ||
      !Array.isArray(candidate.seen) ||
      candidate.seen.length > validKeys.size ||
      !candidate.seen.every(
        (key) => typeof key === 'string' && validKeys.has(key),
      )
    )
      return undefined;
    const saved = (candidate.starts ?? {}) as Record<string, unknown>;
    const starts = Object.fromEntries(
      INTEGRATIONS.flatMap((integration) => {
        const start = validStart(saved[integration], now);
        return start ? [[integration, start]] : [];
      }),
    );
    return {
      id: candidate.id,
      subjectId,
      lastActive: candidate.lastActive,
      seen: [...new Set(candidate.seen as string[])],
      starts,
    };
  } catch {
    /* Invalid local state starts a fresh session. */
    return undefined;
  }
}

/**
 * Browser-side identity and session state for the development collector.
 * Storage is best-effort: when `localStorage` is blocked the state lives in
 * page memory only. No collector state represents a person or repository.
 */
export class DevelopmentSession {
  private subject?: RuntimeEvent['subject'];
  private session?: Session;
  private memoryOnly = false;

  private read(key: string): string | null {
    if (this.memoryOnly) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      this.memoryOnly = true;
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    if (this.memoryOnly) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      this.memoryOnly = true;
      return false;
    }
  }

  private save(session: Session): void {
    this.session = session;
    this.write(SESSION_KEY, JSON.stringify(session));
  }

  /**
   * Marks the session active, loading or creating the browser identity and
   * starting a new session after {@link SESSION_IDLE} of inactivity.
   *
   * @param now - Current time in epoch milliseconds.
   * @returns The browser identity and the current session id.
   */
  touch(now: number): DevelopmentIdentity {
    if (!this.subject) {
      const saved = this.read(IDENTITY_KEY);
      const id = saved && UUID.test(saved) ? saved : window.crypto.randomUUID();
      const persistent = saved === id || this.write(IDENTITY_KEY, id);
      this.subject = {
        id,
        namespace: 'development_browser',
        scope: persistent ? 'persistent' : 'memory',
      };
    }
    const stored = validSession(this.read(SESSION_KEY), this.subject.id, now);
    const current = stored ?? this.session;
    const active =
      current &&
      current.subjectId === this.subject.id &&
      now >= current.lastActive &&
      now - current.lastActive < SESSION_IDLE
        ? current
        : {
            id: window.crypto.randomUUID(),
            subjectId: this.subject.id,
            lastActive: now,
            seen: [],
            starts: {},
          };
    this.save({ ...active, lastActive: now });
    return { subject: { ...this.subject }, sessionId: active.id };
  }

  /**
   * Returns the session start event for an integration. The envelope is reused
   * until the package version or installation token changes or it is older than
   * {@link MAX_AGE}; a transport change alone only updates the reported property.
   *
   * @param options - Collector options, with the installation token if any.
   * @param transport - Transport kind to report.
   * @param identity - Result of the preceding {@link DevelopmentSession.touch}.
   * @param now - Current time in epoch milliseconds.
   * @returns The `runtime.session_started` event.
   */
  initialization(
    options: DevelopmentStartOptions,
    transport: DevelopmentTransportKind,
    identity: DevelopmentIdentity,
    now: number,
  ): RuntimeEvent {
    const session = this.session;
    if (!session) throw new Error('uninitialized_session');
    const installationToken = token(options.installationToken);
    const existing = session.starts[options.integration];
    const start =
      existing &&
      existing.packageVersion === options.packageVersion &&
      existing.installationToken === installationToken &&
      now - Date.parse(existing.occurredAt) < MAX_AGE
        ? existing
        : {
            eventId: window.crypto.randomUUID(),
            occurredAt: new Date(now).toISOString(),
            packageVersion: options.packageVersion,
            ...(installationToken ? { installationToken } : {}),
          };
    if (start !== existing) {
      this.save({
        ...session,
        starts: { ...session.starts, [options.integration]: start },
      });
    }
    return {
      eventId: start.eventId,
      occurredAt: start.occurredAt,
      kind: 'runtime.session_started',
      collectorVersion: '1',
      ...(start.installationToken
        ? { installationToken: start.installationToken }
        : {}),
      ...identity,
      properties: {
        integration: options.integration,
        packageName: options.packageName,
        packageVersion: start.packageVersion,
        transport,
      },
    };
  }

  /**
   * Claims a once-per-session key of the form `<integration>:<kind>`.
   *
   * @param key - The key to claim.
   * @returns True the first time a valid key is claimed in the session.
   */
  claim(key: string): boolean {
    const session = this.session;
    if (!session || session.seen.includes(key) || !validKeys.has(key))
      return false;
    this.save({ ...session, seen: [...session.seen, key] });
    return true;
  }
}
