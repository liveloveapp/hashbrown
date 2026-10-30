import test from 'node:test';
import assert from 'node:assert/strict';
import { runMastraScenario } from './mastra.mjs';

for (const profile of ['buffered', 'live']) {
  test(`real Mastra ${profile} tool execution preserves configured START timing`, async () => {
    const scenario = await runMastraScenario({ profile });

    assert.equal(scenario.evidence.toolExecutions, 1);
    assert.equal(
      scenario.evidence.startBeforeToolCompletion,
      profile === 'live',
    );
    assert.equal(
      scenario.events.some((event) => event.type === 'RUN_FINISHED'),
      true,
    );
    assert.equal(
      scenario.events.find((event) => event.type === 'TOOL_CALL_RESULT')
        .content,
      scenario.expected.calls[0].result,
    );
  });
}

test('Mastra rejects unknown profiles before model execution', async () => {
  await assert.rejects(
    runMastraScenario({ profile: 'unknown' }),
    /Unknown Mastra profile/,
  );
});

test('Mastra serializes tool failure as content without a top-level error marker', async () => {
  const scenario = await runMastraScenario({ outcome: 'failure' });

  const result = scenario.events.find(
    (event) => event.type === 'TOOL_CALL_RESULT',
  );

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.deepEqual(JSON.parse(result.content), {
    error: 'Weather service unavailable',
  });
  assert.equal(Object.hasOwn(result, 'error'), false);
  assert.equal(Object.hasOwn(result, 'isError'), false);
  assert.equal(
    scenario.events.some((event) => event.type === 'RUN_ERROR'),
    false,
  );
  assert.equal(
    scenario.events.find((event) => event.type === 'RUN_FINISHED').outcome,
    undefined,
  );
});

test('Mastra aborts a real blocked tool through the public bridge', async () => {
  const scenario = await runMastraScenario({ outcome: 'cancel' });

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.equal(scenario.evidence.toolCompleted, false);
  assert.equal(scenario.evidence.toolAbortObserved, true);
  assert.equal(
    scenario.events.find((event) => event.type === 'RUN_FINISHED').outcome.type,
    'cancelled',
  );
});

for (const profile of ['buffered', 'live']) {
  test(`Mastra ${profile} success is reproducible with exact installed versions`, async () => {
    const { semanticProjection } = await import('./capture.mjs');
    const first = await runMastraScenario({ profile });
    const second = await runMastraScenario({ profile });

    assert.deepEqual(
      semanticProjection(first.events),
      semanticProjection(second.events),
    );
    assert.deepEqual(first.versions, {
      '@ag-ui/mastra': '2.0.1',
      '@mastra/core': '1.80.0',
      '@mastra/client-js': '1.57.0',
      '@ag-ui/core': '1.0.3',
    });
  });
}

test('Mastra native background tasks produce activity snapshots during real execution', async () => {
  const profile = 'background';

  const scenario = await runMastraScenario({ profile });
  const activities = scenario.events.filter((event) =>
    event.type.startsWith('ACTIVITY_'),
  );

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.equal(scenario.evidence.toolCompleted, true);
  assert.equal(scenario.evidence.activityBeforeToolCompletion, true);
  assert.ok(activities.length > 0);
  assert.equal(activities[0].activityType, 'mastra-background-task');
  assert.equal(activities[0].messageId, activities[0].content.taskId);
  assert.equal(activities[0].content.status, 'running');
  assert.equal(
    activities.every((event) => event.messageId === activities[0].messageId),
    true,
  );
  for (const field of ['/startedAt', '/completedAt']) {
    const value = activities
      .flatMap((event) => event.patch ?? [])
      .find((patch) => patch.path === field)?.value;
    assert.equal(typeof value, 'string');
    assert.equal(Number.isFinite(Date.parse(value)), true);
  }
  assert.equal(scenario.versions['@mastra/memory'], '1.39.1');
  assert.deepEqual(scenario.expected.calls, []);
  assert.equal(
    activities.some((event) =>
      event.patch?.some(
        (patch) => patch.path === '/status' && patch.value === 'completed',
      ),
    ),
    true,
  );
  assert.equal(
    scenario.events
      .filter((event) => event.type === 'TEXT_MESSAGE_CHUNK')
      .map((event) => event.delta)
      .join(''),
    scenario.expected.text,
  );
  assert.equal(
    scenario.events.some((event) => event.type === 'TOOL_CALL_START'),
    false,
  );
});

test('Mastra background activity retains a real task failure as supplied error text', async () => {
  const options = { profile: 'background', outcome: 'failure' };

  const scenario = await runMastraScenario(options);
  const patches = scenario.events
    .filter((event) => event.type === 'ACTIVITY_DELTA')
    .flatMap((event) => event.patch);

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.equal(scenario.profile, 'background-failure');
  assert.equal(scenario.expected.activities[0].content.status, 'failed');
  assert.ok(
    patches.some(
      (patch) => patch.path === '/status' && patch.value === 'failed',
    ),
  );
  assert.ok(
    patches.some(
      (patch) =>
        patch.path === '/error' &&
        JSON.stringify(patch.value).includes('Weather service unavailable'),
    ),
  );
});
