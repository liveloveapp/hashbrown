import { expect, test } from 'vitest';
import {
  createWorkbenchCapture,
  parseWorkbenchCapture,
} from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { publishWorkbenchCapture } from '../src/tools/workbench-capture-file';

function recordedCapture() {
  const store = createWorkbenchStore();
  store.send('Plan');
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: '{"ui":[',
  });
  return createWorkbenchCapture(store.getSnapshot(), {
    lesson: 'generative-ui',
    framework: 'react',
    recordedAt: '2026-10-28T00:00:00.000Z',
  });
}

test('publishing stamps the commit and keeps every event', () => {
  const capture = recordedCapture();
  const raw = JSON.stringify(capture);

  const published = parseWorkbenchCapture(
    JSON.parse(publishWorkbenchCapture(raw, 'abc123')),
  );

  expect(published).toEqual({ ...capture, commit: 'abc123' });
  expect(published?.events.length).toBe(capture.events.length);
});

test('publishing refuses captures over 2 MB', () => {
  const capture = recordedCapture();
  const last = capture.events[capture.events.length - 1];
  const raw = JSON.stringify({
    ...capture,
    events: [...capture.events, { ...last, json: 'x'.repeat(2_000_000) }],
  });

  const publish = () => publishWorkbenchCapture(raw, 'abc123');

  expect(publish).toThrow(
    /^Capture for react\/generative-ui is \d+ bytes; the limit is 2000000$/,
  );
});

test('publishing refuses captures that ended in error', () => {
  const capture = recordedCapture();
  const last = capture.events[capture.events.length - 1];
  const raw = JSON.stringify({
    ...capture,
    events: [...capture.events, { ...last, status: 'error' }],
  });

  const publish = () => publishWorkbenchCapture(raw, 'abc123');

  expect(publish).toThrow('Capture for react/generative-ui ended in error');
});

test('publishing refuses malformed captures', () => {
  const raw = JSON.stringify({ version: 2 });

  const publish = () => publishWorkbenchCapture(raw, 'abc123');

  expect(publish).toThrow('Capture is not a valid workbench capture');
});
