import { afterAll, beforeAll, expect, test, vi } from 'vitest';

/* eslint-disable @nx/enforce-module-boundaries -- the integration suite reuses growth's migrations and executor */
import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../../growth/scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../../growth/src/index.ts';
/* eslint-enable @nx/enforce-module-boundaries */
import { createAdapters } from './channels/registry.ts';
import { createMemoryCredentialStore } from './credentials/memory-store.ts';
import { type DispatchDependencies, dispatchMarketing } from './dispatcher.ts';
import { approvePosts, importWeek, readWeek } from './queue/repository.ts';

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
// A Monday in 1971: no real week uses it, and every `now` below is in 1971.
const WEEK_START = '1971-04-05';
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const SCHEDULED_AT = new Date('1971-04-07T14:00:00Z');

beforeAll(async () => {
  await applyMigrations({ directory: defaultMigrationsDirectory(), executor });
  await executor.execute(
    'delete from marketing_weeks where week_start = $1::date',
    [WEEK_START],
  );
});

afterAll(async () => {
  await executor.execute(
    'delete from marketing_weeks where week_start = $1::date',
    [WEEK_START],
  );
});

test('an approved week publishes its X post, blog and dependent dev.to post in order', async () => {
  const { weekId } = await importWeek(executor, {
    weekStart: WEEK_START,
    researchBrief: {},
    posts: [
      {
        key: 'x',
        channel: 'x',
        kind: 'take',
        scheduledAt: SCHEDULED_AT.toISOString(),
        draft: { channel: 'x', text: 'A take on hashbrown.' },
        sources: [{ url: 'https://hashbrown.dev', note: 'site' }],
      },
      {
        key: 'blog',
        channel: 'blog',
        kind: 'blog',
        scheduledAt: SCHEDULED_AT.toISOString(),
        draft: {
          channel: 'blog',
          slug: 'tick-post',
          title: 'Tick',
          prNumber: 1,
        },
        sources: [{ url: 'https://hashbrown.dev', note: 'site' }],
      },
      {
        key: 'dev',
        channel: 'devto',
        kind: 'blog_promo',
        scheduledAt: SCHEDULED_AT.toISOString(),
        draft: {
          channel: 'devto',
          blogSlug: 'tick-post',
          article: { title: 'Tick', tags: ['ai'], description: 'A post.' },
        },
        sources: [{ url: 'https://hashbrown.dev', note: 'site' }],
        dependsOnKey: 'blog',
      },
    ],
  } as never);
  await approvePosts(executor, weekId);

  let merged = false;
  const github = {
    updateBranch: vi.fn(async () => undefined),
    pullState: vi.fn(async () => ({
      state: merged ? ('closed' as const) : ('open' as const),
      merged,
      mergeable: true,
      mergeableState: 'clean',
    })),
    merge: vi.fn(async () => {
      merged = true;
    }),
    readFile: vi.fn(async () => '---\ntitle: Tick\n---\n\nBody text.\n'),
  };
  const credentials = createMemoryCredentialStore();
  const adapters = createAdapters({ credentials, env: {}, dryRun: true });
  const posted: string[] = [];
  for (const id of ['x', 'linkedin', 'devto'] as const) {
    const adapter = adapters[id];
    const post = adapter.post.bind(adapter);
    adapter.post = async (draft) => {
      posted.push(draft.channel);
      return post(draft);
    };
  }

  function tick(now: Date) {
    const deps: DispatchDependencies = {
      executor,
      adapters,
      credentials,
      github,
      isLive: async () => true,
      now: () => now,
    };
    return dispatchMarketing(deps);
  }

  await tick(new Date(SCHEDULED_AT.getTime() - 2 * HOUR));
  await tick(SCHEDULED_AT);
  await tick(new Date(SCHEDULED_AT.getTime() + 15 * MINUTE));
  // The dev.to post waits for the blog to be published, so it goes next tick.
  await tick(new Date(SCHEDULED_AT.getTime() + 30 * MINUTE));

  const week = await readWeek(executor, WEEK_START);
  const byChannel = Object.fromEntries(
    (week?.posts ?? []).map((post) => [post.channel, post]),
  );
  expect(week?.posts.map((post) => post.status)).toEqual([
    'published',
    'published',
    'published',
  ]);
  expect(github.merge).toHaveBeenCalledTimes(1);
  expect(byChannel['blog']?.externalUrl).toBe(
    'https://hashbrown.dev/blog/tick-post',
  );
  expect(posted).toEqual(['x', 'devto']);
  expect(byChannel['devto']?.publishedAt?.getTime()).toBeGreaterThan(
    byChannel['blog']?.publishedAt?.getTime() ?? Infinity,
  );
});
