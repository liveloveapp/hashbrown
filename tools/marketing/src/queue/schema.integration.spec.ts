import { afterAll, beforeAll, expect, test } from 'vitest';

/* eslint-disable @nx/enforce-module-boundaries -- the integration suite reuses growth's migrations and executor */
import {
  applyMigrations,
  defaultMigrationsDirectory,
} from '../../../growth/scripts/apply-migrations.mts';
import { createDatabaseExecutor } from '../../../growth/src/index.ts';
/* eslint-enable @nx/enforce-module-boundaries */

const executor = createDatabaseExecutor(process.env['TEST_DATABASE_URL']);
// A Monday in 1971: no real week in the shared test store uses it.
const WEEK_START = '1971-01-04';

beforeAll(async () => {
  await applyMigrations({
    directory: defaultMigrationsDirectory(),
    executor,
  });
});

afterAll(async () => {
  // Posts cascade with their week.
  await executor.execute(
    'delete from marketing_weeks where week_start = $1::date',
    [WEEK_START],
  );
  await executor.close?.();
});

async function insertWeek(): Promise<string> {
  const { rows } = await executor.execute<{ id: string }>(
    `insert into marketing_weeks (week_start) values ($1::date)
     on conflict (week_start) do update set week_start = excluded.week_start
     returning id`,
    [WEEK_START],
  );
  const [week] = rows;
  if (!week) throw new Error('marketing_weeks upsert returned no row');
  return week.id;
}

function insertPost(weekId: string, status = 'draft') {
  return executor.execute(
    `insert into marketing_posts (week_id, channel, kind, scheduled_at, draft, status)
     values ($1::uuid, 'x', 'release', '1971-01-04T14:00:00Z', '{"text":"hi"}', $2)`,
    [weekId, status],
  );
}

test('a post with an unknown status is rejected', async () => {
  const weekId = await insertWeek();

  await expect(insertPost(weekId, 'bogus')).rejects.toThrow();
});

test('a post whose week does not exist is rejected', async () => {
  await expect(
    insertPost('00000000-0000-4000-8000-000000000000'),
  ).rejects.toThrow();
});

test('deleting a week deletes its posts', async () => {
  const weekId = await insertWeek();
  await insertPost(weekId);

  await executor.execute('delete from marketing_weeks where id = $1::uuid', [
    weekId,
  ]);
  const { rows } = await executor.execute(
    'select 1 from marketing_posts where week_id = $1::uuid',
    [weekId],
  );

  expect(rows).toEqual([]);
});
