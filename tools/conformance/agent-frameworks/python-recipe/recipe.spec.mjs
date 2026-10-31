import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startPydanticHost } from './controller.mjs';
import {
  captureScenario,
  captureClientRoundTrip,
  parseEvents,
} from '../python/capture.mjs';

for (const scenario of [
  'failure',
  'cancel-default',
  'cancel-v1',
  'server-tool',
]) {
  test(`installed generic adapter reports real ${scenario} over HTTP`, async () => {
    const host = await startPydanticHost();

    try {
      const capture = await captureScenario(host, scenario);
      const events = parseEvents(capture.bytes);
      const results = events.filter(
        (event) => event.type === 'TOOL_CALL_RESULT',
      );

      assert.equal(results.length, 1);
      const expected = scenario.startsWith('cancel')
        ? 'cancelled'
        : scenario === 'failure'
          ? 'failure'
          : 'success';
      assert.equal(results[0].metadata?.['hashbrown.tool']?.outcome, expected);
      assert.ok(!capture.bytes.toString().includes('b4.'));
      if (scenario.startsWith('cancel')) {
        assert.equal(capture.observations.cancelled, 1);
        assert.equal(capture.observations.completed, 0);
        await host.release(capture.body.threadId);
        assert.equal((await host.state(capture.body.threadId)).completed, 0);
      }
      if (scenario === 'failure')
        assert.ok(results[0].metadata['hashbrown.tool'].error.message);
    } finally {
      await host.stop();
    }
  });
}

test('installed generic adapter reuses native frontend deferral and continuation', async () => {
  const host = await startPydanticHost();

  try {
    const captures = await captureClientRoundTrip(host);
    const first = parseEvents(captures['client-tool'].bytes);
    const continued = parseEvents(captures['client-continuation'].bytes);

    assert.equal(
      first.filter((event) => event.type === 'TOOL_CALL_START').length,
      1,
    );
    assert.ok(!first.some((event) => event.type === 'TOOL_CALL_RESULT'));
    assert.ok(
      continued.some(
        (event) =>
          event.type === 'TEXT_MESSAGE_CONTENT' &&
          event.delta.includes('controlled-client-result:London'),
      ),
    );
    assert.ok(
      JSON.stringify(
        captures['client-continuation'].observations.modelRequests,
      ).includes('controlled-client-result:London'),
    );
  } finally {
    await host.stop();
  }
});

for (const approved of [true, false]) {
  test(`native approval ${approved ? 'approval' : 'denial'} requires no custom executor`, async () => {
    const host = await startPydanticHost();
    const { captureApproval } = await import('./capture.mjs');

    try {
      const captures = await captureApproval(host, approved);
      const final = captures[approved ? 'approval-approve' : 'approval-deny'];
      const result = parseEvents(final.bytes).find(
        (event) => event.type === 'TOOL_CALL_RESULT',
      );

      assert.equal(
        result.metadata['hashbrown.tool'].outcome,
        approved ? 'success' : 'denied',
      );
      assert.equal(final.observations.completed, approved ? 1 : 0);
      assert.ok(!final.bytes.toString().includes('b4.'));
    } finally {
      await host.stop();
    }
  });
}

test('standard native steps, activities and state arrive live without a vendor protocol', async () => {
  const host = await startPydanticHost();
  const { captureProtocol } = await import('./capture.mjs');

  try {
    const capture = await captureProtocol(host);
    const events = parseEvents(capture.bytes);

    assert.deepEqual(capture.liveObservations, {
      activitySeen: true,
      completedBeforeRelease: 0,
    });
    for (const type of [
      'STEP_STARTED',
      'STEP_FINISHED',
      'ACTIVITY_SNAPSHOT',
      'ACTIVITY_DELTA',
      'STATE_SNAPSHOT',
      'STATE_DELTA',
    ])
      assert.ok(
        events.some((event) => event.type === type),
        type,
      );
    assert.ok(!events.some((event) => event.type === 'CUSTOM'));
    assert.ok(!capture.bytes.toString().includes('b4.'));
  } finally {
    await host.stop();
  }
});

test('the live producer imports the installed distribution rather than source checkout', async () => {
  const host = await startPydanticHost();

  try {
    const response = await fetch(`${host.url}/health`);
    const health = await response.json();

    assert.equal(health.adapterVersion, '0.1.0');
    assert.match(
      health.adapterFile,
      /[/\\]site-packages[/\\]hashbrown_pydantic_ai[/\\]__init__\.py$/,
    );
  } finally {
    await host.stop();
  }
});

test('overlapping native runs on one producer keep thread results and releases isolated', async () => {
  const host = await startPydanticHost();
  const { captureIsolation } = await import('./capture.mjs');

  try {
    const captures = await captureIsolation(host);

    assert.deepEqual(captures['isolation-a'].liveObservations, {
      otherCompletedBeforeRelease: 0,
      otherSettledBeforeRelease: false,
    });
    for (const [scenario, capture] of Object.entries(captures)) {
      assert.equal(capture.observations.completed, 1);
      const events = parseEvents(capture.bytes);
      assert.ok(
        events.some(
          (event) => event.toolCallId === `${capture.body.threadId}-server`,
        ),
      );
      assert.ok(
        !capture.bytes
          .toString()
          .includes(
            scenario === 'isolation-a'
              ? 'capture-isolation-b'
              : 'capture-isolation-a',
          ),
      );
    }
  } finally {
    await host.stop();
  }
});
