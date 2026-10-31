import { expect, test } from 'vitest';
import {
  createWorkbenchCapture,
  parseWorkbenchCapture,
  withWorkbenchCaptureMilestones,
} from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';

test('creates a capture from a store snapshot with every event and no commit', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: '{"ui":[',
  });
  const snapshot = store.getSnapshot();

  const capture = createWorkbenchCapture(snapshot, {
    lesson: 'generative-ui',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
  const parsed = parseWorkbenchCapture(JSON.parse(JSON.stringify(capture)));

  expect(capture.events.length).toBe(snapshot.events.length);
  expect(capture.commit).toBeNull();
  expect(parsed).toEqual(capture);
});

test('rejects captures with another version, an unknown lesson or malformed events', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  const valid = createWorkbenchCapture(store.getSnapshot(), {
    lesson: 'generative-ui',
    framework: 'angular',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });

  const wrongVersion = parseWorkbenchCapture({ ...valid, version: 2 });
  const unknownLesson = parseWorkbenchCapture({ ...valid, lesson: 'nope' });
  const malformedEvents = parseWorkbenchCapture({
    ...valid,
    events: [{ sequence: 'x', turn: 0, elapsedMs: 0 }],
  });

  expect(wrongVersion).toBeNull();
  expect(unknownLesson).toBeNull();
  expect(malformedEvents).toBeNull();
});

test('rejects events with missing structure or non-finite numbers', () => {
  const store = createWorkbenchStore();
  store.send('Plan');
  const valid = createWorkbenchCapture(store.getSnapshot(), {
    lesson: 'generative-ui',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
  const event = valid.events[0];
  const withEvent = (patch: Record<string, unknown>) =>
    parseWorkbenchCapture({ ...valid, events: [{ ...event, ...patch }] });

  const results = [
    withEvent({ kind: 'nope' }),
    withEvent({ kind: undefined }),
    withEvent({ source: 1 }),
    withEvent({ messages: undefined }),
    withEvent({ application: null }),
    withEvent({ application: [] }),
    withEvent({ elapsedMs: Number.NaN }),
    withEvent({ sequence: Number.POSITIVE_INFINITY }),
  ];

  expect(valid.events.length).toBeGreaterThan(0);
  expect(withEvent({})).not.toBeNull();
  expect(results.every((result) => result === null)).toBe(true);
});

function streamedCapture(lesson: 'generative-ui' | 'prose') {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: '{' });
  store.record('tool', { name: 'readContext', result: { revision: 0 } });
  return createWorkbenchCapture(store.getSnapshot(), {
    lesson,
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
}

test('stamping records milestones computed with the lesson format', () => {
  const ui = streamedCapture('generative-ui');
  const text = streamedCapture('prose');

  const stampedUi = withWorkbenchCaptureMilestones(ui);
  const stampedText = withWorkbenchCaptureMilestones(text);

  expect(stampedUi.milestones).toEqual([
    { id: 'prompt-1', index: 0, label: 'Prompt' },
    { id: 'streaming-json-1', index: 1, label: 'Streaming JSON' },
    { id: 'tool-readcontext-1', index: 2, label: 'Tool readContext' },
  ]);
  expect(stampedText.milestones?.[1]).toEqual({
    id: 'streaming-text-1',
    index: 1,
    label: 'Streaming text',
  });
  expect(stampedUi.events).toBe(ui.events);
});

test('parses recorded milestones and keeps captures without them valid', () => {
  const capture = withWorkbenchCaptureMilestones(
    streamedCapture('generative-ui'),
  );
  const { milestones, ...bare } = capture;

  const parsed = parseWorkbenchCapture(JSON.parse(JSON.stringify(capture)));
  const parsedBare = parseWorkbenchCapture(JSON.parse(JSON.stringify(bare)));

  expect(parsed?.milestones).toEqual(milestones);
  expect(parsedBare).not.toBeNull();
  expect(parsedBare?.milestones).toBeUndefined();
});

test('rejects captures with malformed recorded milestones', () => {
  const capture = streamedCapture('generative-ui');
  const withMilestones = (milestones: unknown) =>
    parseWorkbenchCapture({ ...capture, milestones });
  const valid = { id: 'prompt-1', index: 0, label: 'Prompt' };

  const results = [
    withMilestones('prompt-1'),
    withMilestones([null]),
    withMilestones([{ ...valid, id: '' }]),
    withMilestones([{ ...valid, id: 1 }]),
    withMilestones([{ ...valid, label: undefined }]),
    withMilestones([{ ...valid, index: 0.5 }]),
    withMilestones([{ ...valid, index: -1 }]),
    withMilestones([{ ...valid, index: capture.events.length }]),
    withMilestones([valid, { ...valid, index: 1 }]),
  ];

  expect(withMilestones([valid])).not.toBeNull();
  expect(results.every((result) => result === null)).toBe(true);
});
