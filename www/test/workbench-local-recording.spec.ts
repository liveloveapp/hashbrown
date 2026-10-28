import { expect, test } from 'vitest';
import { workbenchLocalRecordingCues } from '../src/tools/workbench-local-recording';

test('native captions use measured real-time preparation, local turns and explicit acceptance', () => {
  const phases = {
    prepared: 3,
    firstComplete: 9,
    firstAccepted: 12,
    secondComplete: 18,
    secondAccepted: 21,
    replay: 24,
    returnedLive: 27,
  };

  const cues = workbenchLocalRecordingCues(
    { lesson: 'local-models', phases },
    29,
  );

  expect(cues).toHaveLength(8);
  for (const [from, to, caption] of cues ?? []) {
    expect(to).toBeGreaterThan(from);
    expect(to).toBeLessThanOrEqual(29);
    expect(caption.length / (to - from)).toBeLessThanOrEqual(20);
  }
  expect(() =>
    workbenchLocalRecordingCues({ lesson: 'local-models', phases: {} }, 29),
  ).toThrow();
});
