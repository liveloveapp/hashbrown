import type { Page } from '@playwright/test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  createWorkbenchCapture,
  parseWorkbenchCapture,
} from '../examples/quickstart/runtime/workbench-capture';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  assertPublishableCapture,
  prepareWorkbenchCaptures,
  publishWorkbenchCapture,
  saveWorkbenchCapture,
  stageWorkbenchCaptures,
} from '../src/tools/workbench-capture-file';

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

test('publishing refuses a capture recorded for another lesson', () => {
  const raw = JSON.stringify(recordedCapture());

  const publish = () =>
    publishWorkbenchCapture(raw, 'abc123', {
      framework: 'angular',
      lesson: 'tools',
    });

  expect(publish).toThrow(
    'Capture for angular/tools was recorded as react/generative-ui',
  );
});

test('a capture that ended in error is not publishable', () => {
  const capture = recordedCapture();
  const last = capture.events[capture.events.length - 1];
  const failed = {
    ...capture,
    events: [...capture.events, { ...last, status: 'error' as const }],
  };

  const assert = () => assertPublishableCapture(failed);

  expect(assert).toThrow('Capture for react/generative-ui ended in error');
});

test('saving refuses an unpublishable capture without writing it', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const path = resolve(root, 'react-generative-ui-live.capture.json');
  const capture = recordedCapture();
  const last = capture.events[capture.events.length - 1];
  const page = {
    evaluate: async () => ({
      ...capture,
      events: [...capture.events, { ...last, status: 'error' }],
    }),
  } as unknown as Page;

  try {
    const save = saveWorkbenchCapture(page, path);

    await expect(save).rejects.toThrow(
      'Capture for react/generative-ui ended in error',
    );
    expect(existsSync(path)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saving writes a publishable capture', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const path = resolve(root, 'react-generative-ui-live.capture.json');
  const capture = recordedCapture();
  const page = { evaluate: async () => capture } as unknown as Page;

  try {
    await saveWorkbenchCapture(page, path);

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(capture);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preparing a batch lists every unpublishable capture before publishing', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const capture = recordedCapture();
  const last = capture.events[capture.events.length - 1];
  writeFileSync(
    resolve(root, 'react-generative-ui-live.capture.json'),
    JSON.stringify({
      ...capture,
      events: [...capture.events, { ...last, status: 'error' }],
    }),
  );
  writeFileSync(resolve(root, 'react-tools-live.capture.json'), '{');
  writeFileSync(
    resolve(root, 'angular-tools-live.capture.json'),
    JSON.stringify(capture),
  );
  const reports = [
    { framework: 'react', lesson: 'generative-ui' },
    { framework: 'react', lesson: 'tools' },
    { framework: 'angular', lesson: 'tools' },
    { framework: 'angular', lesson: 'streaming' },
  ] as const;

  try {
    const prepare = () => prepareWorkbenchCaptures(root, reports, 'abc123');

    expect(prepare).toThrow(
      [
        'Unpublishable captures:',
        '- Capture for react/generative-ui ended in error',
        '- Capture for react/tools is not a valid workbench capture',
        '- Capture for angular/tools was recorded as react/generative-ui',
        '- Missing capture for angular/streaming',
      ].join('\n'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preparing a batch stamps every capture by report', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const capture = recordedCapture();
  writeFileSync(
    resolve(root, 'react-generative-ui-live.capture.json'),
    JSON.stringify(capture),
  );

  try {
    const prepared = prepareWorkbenchCaptures(
      root,
      [{ framework: 'react', lesson: 'generative-ui' }],
      'abc123',
    );

    expect(JSON.parse(prepared.get('react-generative-ui') ?? 'null')).toEqual({
      ...capture,
      commit: 'abc123',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('staging writes each stamped capture beside its published id', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const staging = resolve(root, 'media');
  const capture = {
    ...recordedCapture(),
    lesson: 'production-recovery',
  };
  writeFileSync(
    resolve(root, 'react-production-recovery-live.capture.json'),
    JSON.stringify(capture),
  );
  mkdirSync(staging);
  const recordings = [
    {
      id: 'canonical-workbench-production-recovery-react',
      framework: 'react',
      lesson: 'production-recovery',
    },
  ];

  try {
    stageWorkbenchCaptures(root, staging, recordings, 'abc123');

    expect(
      JSON.parse(
        readFileSync(
          resolve(
            staging,
            'canonical-workbench-production-recovery-react-capture.json',
          ),
          'utf8',
        ),
      ),
    ).toEqual({ ...capture, commit: 'abc123' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('staging writes nothing when any capture is unpublishable', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'workbench-capture-'));
  const staging = resolve(root, 'media');
  writeFileSync(
    resolve(root, 'react-production-recovery-live.capture.json'),
    JSON.stringify({ ...recordedCapture(), lesson: 'production-recovery' }),
  );
  mkdirSync(staging);
  const recordings = [
    {
      id: 'canonical-workbench-production-recovery-react',
      framework: 'react',
      lesson: 'production-recovery',
    },
    {
      id: 'canonical-workbench-production-recovery-angular',
      framework: 'angular',
      lesson: 'production-recovery',
    },
  ];

  try {
    const stage = () =>
      stageWorkbenchCaptures(root, staging, recordings, 'abc123');

    expect(stage).toThrow(
      [
        'Unpublishable captures:',
        '- Missing capture for angular/production-recovery',
      ].join('\n'),
    );
    expect(
      existsSync(
        resolve(
          staging,
          'canonical-workbench-production-recovery-react-capture.json',
        ),
      ),
    ).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
