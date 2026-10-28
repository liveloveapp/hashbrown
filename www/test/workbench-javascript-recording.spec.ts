import { expect, test } from 'vitest';
import { workbenchJavaScriptRecordingCues } from '../src/tools/workbench-javascript-recording';

const phases = {
  firstComplete: 5,
  secondComplete: 10,
  rejected: 15,
  recovered: 20,
  replay: 25,
  returnedLive: 30,
};

test('runtime captions follow actual code, results, errors and inert playback', () => {
  const cues = workbenchJavaScriptRecordingCues(
    { lesson: 'javascript-runtime', phases },
    62,
  );

  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('QuickJS');
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('No model');
  for (const [from, to, text] of cues ?? []) {
    expect(to).toBeGreaterThan(from);
    expect(to).toBeLessThanOrEqual(31);
    expect(text.length / ((to - from) * 2)).toBeLessThanOrEqual(20);
  }
});

test('runtime captions reject missing phases or unreadable intervals', () => {
  expect(() =>
    workbenchJavaScriptRecordingCues(
      { lesson: 'javascript-runtime', phases: {} },
      62,
    ),
  ).toThrow();
  expect(() =>
    workbenchJavaScriptRecordingCues(
      {
        lesson: 'javascript-runtime',
        phases: { ...phases, secondComplete: 5.01 },
      },
      62,
    ),
  ).toThrow();
  expect(
    workbenchJavaScriptRecordingCues({ lesson: 'tools', phases }, 62),
  ).toBeUndefined();
});
