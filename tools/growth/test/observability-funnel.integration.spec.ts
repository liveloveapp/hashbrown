import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test } from 'vitest';

import type { SqlExecutor } from '../src/lib/database.ts';
import type {
  CollectionBatchV1,
  CollectionEventV1,
} from '../src/lib/observability/contracts.ts';
import { acceptObservationBatch } from '../src/lib/observability/ingest.ts';
import { readGrowthFunnel } from '../src/lib/observability/journey-report.ts';
import { processObservations } from '../src/lib/observability/projection.ts';
import {
  cleanEvidence,
  evidenceDatabase,
  evidenceFixture,
  evidenceKeys,
} from './observability-fixtures.ts';

const DAY = 86_400_000;
let db: SqlExecutor;
const subjects: string[] = [];
const emails: string[] = [];

beforeAll(async () => {
  db = await evidenceDatabase();
});

afterAll(async () => {
  await cleanEvidence(db, { subjects, emails });
  await db.close?.();
});

/** UTC midnight `offset` days from today. */
function utcDay(offset: number): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() + offset * DAY);
}

/** Noon UTC on a day, so occurrence and receipt share the UTC date. */
function noon(day: Date): Date {
  return new Date(day.getTime() + DAY / 2);
}

/**
 * Accepts one event with receipt and occurrence at `at` and projects it;
 * returns its observation id.
 */
async function observe(
  source: 'install' | 'runtime',
  event: CollectionEventV1,
  at: Date,
): Promise<string> {
  const batch: CollectionBatchV1 = {
    schemaVersion: 1,
    events: [{ ...event, eventId: randomUUID(), occurredAt: at.toISOString() }],
  };
  await acceptObservationBatch(db, source, batch, {
    now: at,
    keyring: evidenceKeys,
  });
  return (
    await db.execute<{ id: string }>(
      'select id from growth_observations where source=$1 and event_id=$2',
      [source, batch.events[0].eventId],
    )
  ).rows[0].id;
}

/** Processes work until every given observation has a completed projection. */
async function project(ids: readonly string[]): Promise<void> {
  for (let pass = 0; pass < 10; pass++) {
    const pending = await db.execute(
      "select observation_id from growth_observation_work where observation_id=any($1::uuid[]) and status<>'completed'",
      [ids],
    );
    if (pending.rows.length === 0) return;
    await processObservations(db, {
      enabled: true,
      limit: 100,
      now: () => new Date(),
    });
  }
  throw new Error('observations did not project');
}

/** A runtime journey for a fresh subject: each kind lands on its own day. */
async function runtimeJourney(
  days: Partial<Record<string, Date>>,
): Promise<string[]> {
  const template = evidenceFixture().runtime.events[0];
  const subject = { ...template.subject, id: randomUUID() };
  subjects.push(subject.id);
  const ids: string[] = [];
  for (const [kind, day] of Object.entries(days))
    if (day)
      ids.push(
        await observe(
          'runtime',
          { ...template, kind, subject, sessionId: randomUUID() },
          noon(day),
        ),
      );
  return ids;
}

/** A fresh install for `environment` on `day`; returns its observation id. */
async function install(
  environment: 'local' | 'ci',
  day: Date,
): Promise<string> {
  const template = evidenceFixture().install.events[0];
  subjects.push(template.subject.id);
  if (template.identity?.gitEmail) emails.push(template.identity.gitEmail);
  return observe(
    'install',
    {
      ...template,
      properties: {
        ...template.properties,
        environment,
        environmentEvidence:
          environment === 'ci' ? 'generic_ci' : 'interactive_package_manager',
      },
    },
    noon(day),
  );
}

test('activation window is inclusive of day 30 and excludes day 31', async () => {
  const start = utcDay(-60);
  const milestones = (last: number) => ({
    'runtime.session_started': start,
    'runtime.first_stream_completed': start,
    'tool.first_call_executed': new Date(start.getTime() + DAY),
    'component.first_rendered': new Date(start.getTime() + last * DAY),
  });
  const ids = [
    ...(await runtimeJourney(milestones(30))),
    ...(await runtimeJourney(milestones(31))),
  ];
  await project(ids);

  const funnel = await readGrowthFunnel(db, {
    from: start,
    to: utcDay(-59),
  });

  expect(funnel.runtimeFunnel).toMatchObject({
    started: 2,
    streamed: 2,
    tool_used: 2,
    component_rendered: 2,
    activated: 1,
    stalled_after_hello_world: 0,
  });
  expect(funnel.daily).toEqual([
    expect.objectContaining({
      day: start.toISOString().slice(0, 10),
      started: 2,
      streamed: 2,
    }),
  ]);
});

test('a streamed-only subject becomes stalled_after_hello_world on day 8', async () => {
  const dayEight = utcDay(-8);
  const daySeven = utcDay(-7);
  const ids = [
    ...(await runtimeJourney({
      'runtime.session_started': dayEight,
      'runtime.first_stream_completed': dayEight,
    })),
    ...(await runtimeJourney({
      'runtime.session_started': daySeven,
      'runtime.first_stream_completed': daySeven,
    })),
  ];
  await project(ids);

  const funnel = await readGrowthFunnel(db, {
    from: dayEight,
    to: utcDay(-6),
  });

  expect(funnel.runtimeFunnel).toMatchObject({
    started: 2,
    streamed: 2,
    tool_used: 0,
    component_rendered: 0,
    activated: 0,
    stalled_after_hello_world: 1,
  });
});

test('a non-CI install with no runtime within 3 days is stalled_before_first_request, a CI install is not', async () => {
  const installDay = utcDay(-4);
  const ids = [
    await install('local', installDay),
    await install('ci', installDay),
  ];
  await project(ids);

  const funnel = await readGrowthFunnel(db, {
    from: installDay,
    to: utcDay(0),
  });

  expect(funnel.installFunnel).toMatchObject({
    installed: 1,
    reached_runtime: 0,
    stalled_before_first_request: 1,
  });
  expect(funnel.daily).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        day: installDay.toISOString().slice(0, 10),
        installed: 1,
      }),
      expect.objectContaining({
        day: utcDay(-1).toISOString().slice(0, 10),
        stalled_before_first_request: 1,
      }),
    ]),
  );
});
