import { describe, expect, it } from 'vitest';
import { ConflictError, type Repositories, type Session } from './types';
import { createMemoryRepositories } from './memory';
import { createPostgresRepositories } from './postgres';

const emptySession = (): Session => ({
  generation: 1,
  allocations: [],
  activities: [],
  proposals: {},
  operations: {},
});

export function repositoryContract(
  name: string,
  open: () => Promise<Repositories>,
) {
  describe(`${name} repositories`, () => {
    it('creates a session and loads it at version 0', async () => {
      const repos = await open();
      try {
        const id = await repos.sessions.create(emptySession());
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        const doc = await repos.sessions.load(id);
        expect(doc?.version).toBe(0);
        expect(doc?.value.generation).toBe(1);
      } finally {
        await repos.close();
      }
    });

    it('commits with compare-and-swap and rejects stale versions', async () => {
      const repos = await open();
      try {
        const id = await repos.sessions.create(emptySession());
        await repos.sessions.commit(id, 0, {
          ...emptySession(),
          generation: 2,
        });
        expect((await repos.sessions.load(id))?.value.generation).toBe(2);
        await expect(
          repos.sessions.commit(id, 0, { ...emptySession(), generation: 3 }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await repos.sessions.load(id))?.version).toBe(1);
      } finally {
        await repos.close();
      }
    });

    it('returns undefined for unknown ids', async () => {
      const repos = await open();
      try {
        expect(
          await repos.sessions.load('00000000-0000-0000-0000-000000000000'),
        ).toBeUndefined();
        expect(await repos.threads.load('missing')).toBeUndefined();
      } finally {
        await repos.close();
      }
    });

    it('inserts a thread record only once and swaps by version', async () => {
      const repos = await open();
      try {
        const record = {
          sessionId: 's',
          routeId: '/review',
          generation: 1,
          tokens: {},
        };
        await repos.threads.commit('t1', null, record);
        await expect(
          repos.threads.commit('t1', null, record),
        ).rejects.toBeInstanceOf(ConflictError);
        await repos.threads.commit('t1', 0, { ...record, proposalId: 'p' });
        expect((await repos.threads.load('t1'))?.value.proposalId).toBe('p');
        await expect(
          repos.threads.commit('t1', 0, record),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await repos.close();
      }
    });

    it('never returns shared references', async () => {
      const repos = await open();
      try {
        const session = emptySession();
        const id = await repos.sessions.create(session);
        const a = await repos.sessions.load(id);
        const b = await repos.sessions.load(id);
        expect(a?.value).not.toBe(b?.value);
        expect(a?.value).toEqual(b?.value);
      } finally {
        await repos.close();
      }
    });
  });
}

repositoryContract('memory', async () => createMemoryRepositories());

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
if (testDatabaseUrl) {
  repositoryContract('postgres', () =>
    createPostgresRepositories({
      connectionString: testDatabaseUrl,
      schema: `invoicing_test_${process.pid}`,
    }),
  );
}
