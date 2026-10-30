import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCapture, verifyCapture } from './evidence.mjs';

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
