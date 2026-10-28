import { expect, test } from 'vitest';
import { workbenchServerRecordingCues } from '../src/tools/workbench-server-recording';

const phases = {
  session: 3,
  loaded: 6,
  firstComplete: 12,
  saved: 15,
  refreshed: 18,
  restored: 22,
  secondComplete: 28,
  competing: 31,
  conflict: 34,
  recovered: 37,
  denied: 4,
  authorized: 8,
  foreign: 17,
  replay: 40,
  returnedLive: 44,
};

test.each(['server-threads', 'public-endpoint'])(
  '%s captions use measured phases and identify the local boundary',
  (lesson) => {
    const cues = workbenchServerRecordingCues({ lesson, phases }, 94);

    expect(cues).toBeDefined();
    expect(cues?.map((cue) => cue[2]).join(' ')).toContain('local');
    for (const [from, to, text] of cues ?? []) {
      expect(to).toBeGreaterThan(from);
      expect(text.length / ((to - from) * 2)).toBeLessThanOrEqual(20);
    }
  },
);

test('thread captions distinguish real conflict from explicit recovery', () => {
  const text = workbenchServerRecordingCues(
    { lesson: 'server-threads', phases },
    94,
  )
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('409');
  expect(text).toContain('Reload');
  expect(text).toContain('refresh');
});

test('access captions distinguish anonymous and foreign-owner denials', () => {
  const text = workbenchServerRecordingCues(
    { lesson: 'public-endpoint', phases },
    94,
  )
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('401');
  expect(text).toContain('404');
  expect(text).toContain('provider');
});

test('server captions reject absent and unreadable timings and ignore other lessons', () => {
  expect(() =>
    workbenchServerRecordingCues({ lesson: 'server-threads', phases: {} }, 94),
  ).toThrow();
  expect(() =>
    workbenchServerRecordingCues(
      { lesson: 'server-threads', phases: { ...phases, loaded: 3.01 } },
      94,
    ),
  ).toThrow();
  expect(
    workbenchServerRecordingCues({ lesson: 'tools', phases }, 94),
  ).toBeUndefined();
});
