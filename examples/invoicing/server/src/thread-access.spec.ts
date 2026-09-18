import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getServices } from './services';
import policy from './thread-access';

const cookie = (sessionId: string) => ({
  cookie: `invoicing_session=${sessionId}`,
});

const aguiUrl = (routeId: string) =>
  `/agui/${encodeURIComponent(`${routeId}#agent`)}`;

const request = (
  overrides: Partial<Parameters<typeof policy.fallback>[0]>,
): Parameters<typeof policy.fallback>[0] =>
  ({
    action: 'update',
    operation: 'run.agui',
    threadId: 'thread-1',
    thread: undefined,
    headers: {},
    method: 'POST',
    url: aguiUrl('/assistant'),
    requestedMetadata: undefined,
    resuming: false,
    ...overrides,
  }) as Parameters<typeof policy.fallback>[0];

const subject = (access: Record<string, unknown> | undefined) =>
  ({
    thread_id: 'thread-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    status: 'idle',
    metadata: {},
    access,
  }) as NonNullable<Parameters<typeof policy.fallback>[0]['thread']>;

describe('thread access policy', () => {
  it('stamps a created thread with the caller, never the session credential', async () => {
    const { store } = await getServices();
    const sessionId = await store.createSession();

    const result = await policy.create!(
      request({ action: 'create', headers: cookie(sessionId) }),
    );

    expect(result.decision).toBe('allow');
    const stamp = (result as { stamp: Record<string, unknown> }).stamp;
    expect(stamp).toEqual({
      sessionId: createHash('sha256').update(sessionId).digest('hex'),
      generation: 1,
      routeId: '/assistant',
    });
    // The stamp is handed back in the body of GET /threads/:id, so the cookie
    // value itself must not be in it.
    expect(JSON.stringify(stamp)).not.toContain(sessionId);
  });

  it('refuses to create a thread for a caller with no session', async () => {
    const result = await policy.create!(request({ action: 'create' }));
    expect(result.decision).toBe('deny');
  });

  it('admits the session the thread was stamped for', async () => {
    const { store } = await getServices();
    const sessionId = await store.createSession();
    const { stamp } = (await policy.create!(
      request({ action: 'create', headers: cookie(sessionId) }),
    )) as { stamp: Record<string, unknown> };

    const result = await policy.fallback(
      request({ headers: cookie(sessionId), thread: subject(stamp) }),
    );

    expect(result.decision).toBe('allow');
  });

  it.each([
    [
      'another session',
      async (stamp: Record<string, unknown>) => {
        const { store } = await getServices();
        const stranger = await store.createSession();
        return request({ headers: cookie(stranger), thread: subject(stamp) });
      },
    ],
    [
      'no session at all',
      async (stamp: Record<string, unknown>) =>
        request({ thread: subject(stamp) }),
    ],
    [
      'a thread created before the policy existed',
      async (_: unknown) => {
        const { store } = await getServices();
        const sessionId = await store.createSession();
        return request({
          headers: cookie(sessionId),
          thread: subject(undefined),
        });
      },
    ],
  ])('denies %s', async (_name, build) => {
    const { store } = await getServices();
    const sessionId = await store.createSession();
    const { stamp } = (await policy.create!(
      request({ action: 'create', headers: cookie(sessionId) }),
    )) as { stamp: Record<string, unknown> };

    const result = await policy.fallback(await build(stamp));

    expect(result.decision).toBe('deny');
  });

  it('denies a thread whose route does not match the run', async () => {
    const { store } = await getServices();
    const sessionId = await store.createSession();
    const { stamp } = (await policy.create!(
      request({ action: 'create', headers: cookie(sessionId) }),
    )) as { stamp: Record<string, unknown> };

    const result = await policy.fallback(
      request({
        headers: cookie(sessionId),
        thread: subject(stamp),
        url: aguiUrl('/review'),
      }),
    );

    expect(result.decision).toBe('deny');
  });

  it('denies a thread left behind by a reset', async () => {
    const { store } = await getServices();
    const sessionId = await store.createSession();
    const { stamp } = (await policy.create!(
      request({ action: 'create', headers: cookie(sessionId) }),
    )) as { stamp: Record<string, unknown> };

    await store.reset(sessionId);

    const result = await policy.fallback(
      request({ headers: cookie(sessionId), thread: subject(stamp) }),
    );

    expect(result.decision).toBe('deny');
  });
});
