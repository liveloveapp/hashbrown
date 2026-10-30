import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCapture, verifyCapture } from './evidence.mjs';
import { semanticProjection } from '../node/capture.mjs';

/** A producer record used to check evidence integrity, not framework compatibility. */
function record(id = 'call-one') {
  return {
    framework: 'test-producer',
    profile: 'server-tool',
    versions: { bridge: '1.0.0' },
    events: [
      {
        type: 'TOOL_CALL_START',
        toolCallId: id,
        toolCallName: 'lookup',
        timestamp: 1,
      },
    ],
    expected: { calls: [{ name: 'lookup', args: {} }] },
    evidence: { executionCount: 1 },
  };
}

test('accepts independently captured identities while retaining raw evidence hashes', () => {
  const saved = createCapture(record(), 'source-hash');
  const current = createCapture(record('new-call'), 'source-hash');

  const result = verifyCapture(saved, current);

  assert.equal(result, undefined);
  assert.notEqual(
    saved.provenance.eventsSha256,
    current.provenance.eventsSha256,
  );
});

test('rejects tampered saved events even when they match current semantics', () => {
  const saved = createCapture(record(), 'source-hash');
  const current = createCapture(record(), 'source-hash');
  saved.events[0].timestamp = 99;

  const verify = () => verifyCapture(saved, current);

  assert.throws(verify, /hash/i);
});

test('rejects version drift and changed producer semantics', () => {
  const saved = createCapture(record(), 'source-hash');
  const differentVersion = record();
  differentVersion.versions.bridge = '2.0.0';
  const differentEvent = record();
  differentEvent.events[0].toolCallName = 'different';

  const versionCheck = () =>
    verifyCapture(saved, createCapture(differentVersion, 'source-hash'));
  const eventCheck = () =>
    verifyCapture(saved, createCapture(differentEvent, 'source-hash'));

  assert.throws(versionCheck);
  assert.throws(eventCheck);
});

test('rejects source drift and changed execution evidence', () => {
  const saved = createCapture(record(), 'source-hash');
  const changed = record();
  changed.evidence.executionCount = 0;

  const sourceCheck = () =>
    verifyCapture(saved, createCapture(record(), 'changed-source'));
  const evidenceCheck = () =>
    verifyCapture(saved, createCapture(changed, 'source-hash'));

  assert.throws(sourceCheck);
  assert.throws(evidenceCheck);
});

test('compares JSON wire captures when producer objects contain undefined optional properties', () => {
  const input = record();
  input.events[0].optional = undefined;
  const current = createCapture(input, 'source-hash');
  const saved = JSON.parse(JSON.stringify(current));

  const result = verifyCapture(saved, current);

  assert.equal(result, undefined);
});

test('normalizes only the native Mastra delegation thread identity in its explicit profile', () => {
  const scenario = (thread) => ({
    ...record(),
    framework: 'mastra',
    profile: 'native-delegation',
    events: [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'delegate',
        toolCallName: 'agent-worker',
      },
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'delegate',
        content: JSON.stringify({
          text: 'Answer',
          subAgentThreadId: thread,
          subAgentToolResults: [],
        }),
      },
    ],
  });
  const saved = createCapture(scenario('thread-one'), 'source');
  const current = createCapture(scenario('thread-two'), 'source');

  const verify = () => verifyCapture(saved, current);

  assert.doesNotThrow(verify);
  const changed = scenario('thread-two');
  changed.events[1].content = JSON.stringify({
    text: 'Wrong answer',
    subAgentThreadId: 'thread-two',
    subAgentToolResults: [],
  });
  assert.throws(() => verifyCapture(saved, createCapture(changed, 'source')));
  assert.throws(() =>
    verifyCapture(
      { ...saved, profile: 'other' },
      { ...current, profile: 'other' },
    ),
  );
});

/** Builds raw Mastra background activities with independently allocated identities. */
function backgroundRecord(prefix = 'first', startedAt = 1_800_000_000_000) {
  const taskId = `${prefix}-task`;
  return {
    ...record(),
    framework: 'mastra',
    profile: 'background',
    events: [
      {
        type: 'TOOL_CALL_START',
        toolCallId: `${prefix}-call`,
        toolCallName: 'worker',
      },
      {
        type: 'ACTIVITY_SNAPSHOT',
        activityType: 'mastra-background-task',
        messageId: taskId,
        content: {
          taskId,
          toolCallId: `${prefix}-call`,
          startedAt,
          status: 'running',
          args: { query: 'traffic' },
        },
      },
      {
        type: 'ACTIVITY_DELTA',
        activityType: 'mastra-background-task',
        messageId: taskId,
        patch: [
          { op: 'replace', path: '/status', value: 'completed' },
          { op: 'add', path: '/completedAt', value: startedAt + 100 },
          { op: 'add', path: '/result', value: { text: 'Answer' } },
        ],
      },
      {
        type: 'ACTIVITY_SNAPSHOT',
        activityType: 'mastra-background-task',
        messageId: taskId,
        content: {
          taskId,
          toolCallId: `${prefix}-call`,
          startedAt,
          completedAt: startedAt + 100,
          status: 'completed',
          args: { query: 'traffic' },
          result: { text: 'Answer' },
        },
      },
    ],
  };
}

test('compares real Mastra background identities and absolute times without changing raw evidence', () => {
  const saved = createCapture(backgroundRecord(), 'source');
  const current = createCapture(
    backgroundRecord('second', 1_900_000_000_000),
    'source',
  );
  const original = structuredClone({ saved, current });

  const verify = () => verifyCapture(saved, current);

  assert.doesNotThrow(verify);
  assert.deepEqual({ saved, current }, original);
  assert.notEqual(
    saved.provenance.eventsSha256,
    current.provenance.eventsSha256,
  );
});

test('rejects changed background task results, status, arguments and missing fields', () => {
  const saved = createCapture(backgroundRecord(), 'source');
  const mutations = [
    (events) => {
      events[3].content.result.text = 'Wrong';
    },
    (events) => {
      events[3].content.status = 'failed';
    },
    (events) => {
      events[1].content.args.query = 'weather';
    },
    (events) => {
      delete events[1].content.taskId;
    },
    (events) => {
      delete events[1].content.toolCallId;
    },
    (events) => {
      delete events[1].content.startedAt;
    },
    (events) => {
      delete events[3].content.completedAt;
    },
    (events) => {
      events[2].patch.splice(1, 1);
    },
    (events) => {
      events[2].patch[2].value.text = 'Wrong';
    },
  ];

  const checks = mutations.map((mutate) => {
    const changed = backgroundRecord('second', 1_900_000_000_000);
    mutate(changed.events);
    return () => verifyCapture(saved, createCapture(changed, 'source'));
  });

  checks.forEach((check) => assert.throws(check));
});

test('retains task and tool identity relationships across activity and protocol envelopes', () => {
  const saved = createCapture(backgroundRecord(), 'source');
  const changedTask = backgroundRecord('second', 1_900_000_000_000);
  changedTask.events[1].content.taskId = 'unrelated-task';
  const changedCall = backgroundRecord('second', 1_900_000_000_000);
  changedCall.events[1].content.toolCallId = 'unrelated-call';

  const taskCheck = () =>
    verifyCapture(saved, createCapture(changedTask, 'source'));
  const callCheck = () =>
    verifyCapture(saved, createCapture(changedCall, 'source'));

  assert.throws(taskCheck);
  assert.throws(callCheck);
});

test('normalizes background activities only for the explicit Mastra background profile', () => {
  const profiles = [
    { framework: 'mastra', profile: 'other' },
    { framework: 'other', profile: 'background' },
  ];

  const checks = profiles.map(
    (profile) => () =>
      verifyCapture(
        createCapture({ ...backgroundRecord(), ...profile }, 'source'),
        createCapture(
          { ...backgroundRecord('second', 1_900_000_000_000), ...profile },
          'source',
        ),
      ),
  );

  checks.forEach((check) => assert.throws(check));
});

test('preserves arbitrary activity content and unrelated JSON patch fields', () => {
  const mutations = [
    (events) => {
      events[1].content.metadata = { taskId: 'first', startedAt: 10 };
    },
    (events) => {
      events[2].patch.push({
        op: 'add',
        path: '/metadata/startedAt',
        value: 10,
      });
    },
    (events) => {
      events[2].patch[1].op = 'replace';
    },
    (events) => {
      events[1].activityType = 'custom-activity';
    },
    (events) => {
      events[1].type = 'CUSTOM';
    },
  ];

  const checks = mutations.map((mutate) => {
    const saved = backgroundRecord();
    const current = backgroundRecord('second', 1_900_000_000_000);
    mutate(saved.events);
    mutate(current.events);
    if (saved.events[1].content.metadata)
      current.events[1].content.metadata.startedAt = 20;
    if (saved.events[2].patch.length > 3) current.events[2].patch[3].value = 20;
    if (saved.events[2].patch[1].op === 'replace')
      current.events[2].patch[1].op = 'add';
    return () =>
      verifyCapture(
        createCapture(saved, 'source'),
        createCapture(current, 'source'),
      );
  });

  checks.forEach((check) => assert.throws(check));
});

test('projects ISO background timestamps deterministically while preserving their wire types', () => {
  const build = (startedAt, completedAt) => [
    {
      type: 'ACTIVITY_DELTA',
      activityType: 'mastra-background-task',
      messageId: 'task',
      patch: [
        { op: 'add', path: '/startedAt', value: startedAt },
        { op: 'add', path: '/completedAt', value: completedAt },
      ],
    },
  ];
  const first = build('2026-10-30T12:00:00.000Z', '2026-10-30T12:00:10.000Z');
  const second = build('2026-10-31T12:00:00.000Z', '2026-10-31T12:10:00.000Z');

  const projected = semanticProjection(first, { mastraBackground: true });
  const repeated = semanticProjection(second, { mastraBackground: true });

  assert.deepEqual(projected, repeated);
  assert.equal(typeof projected[0].patch[0].value, 'string');
  assert.notDeepEqual(
    projected,
    semanticProjection(build(1_800_000_000_000, null), {
      mastraBackground: true,
    }),
  );
  assert.notDeepEqual(
    projected,
    semanticProjection(build('invalid', '2026-10-30T12:00:10.000Z'), {
      mastraBackground: true,
    }),
  );
  assert.notDeepEqual(semanticProjection(first), semanticProjection(second));
});

test('preserves timestamp presence and non-timestamp values in background projections', () => {
  const input = [
    {
      type: 'ACTIVITY_SNAPSHOT',
      activityType: 'mastra-background-task',
      messageId: 'task',
      content: {
        taskId: 'task',
        startedAt: null,
        completedAt: { unexpected: true },
      },
    },
    {
      type: 'ACTIVITY_DELTA',
      activityType: 'mastra-background-task',
      messageId: 'task',
      patch: [{ op: 'remove', path: '/completedAt' }],
    },
  ];

  const result = semanticProjection(input, { mastraBackground: true });

  assert.deepEqual(result[0].content, {
    taskId: result[0].messageId,
    startedAt: null,
    completedAt: { unexpected: true },
  });
  assert.deepEqual(result[1].patch, [{ op: 'remove', path: '/completedAt' }]);
});
