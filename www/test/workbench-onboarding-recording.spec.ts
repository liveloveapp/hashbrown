import { expect, test } from 'vitest';
import { workbenchOnboardingRecordingCues } from '../src/tools/workbench-onboarding-recording';

const phases = {
  firstComplete: 2,
  followup: 4,
  replay: 7,
  returnedLive: 9,
};

test('first-plan captions describe a preview without tools or application acceptance', () => {
  const report = { lesson: 'first-plan', phases };

  const cues = workbenchOnboardingRecordingCues(report, 22);

  expect(cues?.map(([from, to]) => [from, to])).toEqual([
    [0, 2],
    [2, 7],
    [7, 9],
    [9, 11],
  ]);
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('No tools');
  expect(cues?.map((cue) => cue[2]).join(' ')).not.toContain('Accept plan');
});

test('conversation captions distinguish retained messages from durable storage', () => {
  const report = { lesson: 'conversation', phases };

  const cues = workbenchOnboardingRecordingCues(report, 22);

  expect(cues?.map(([from, to]) => [from, to])).toEqual([
    [0, 2],
    [2, 4],
    [4, 7],
    [7, 9],
    [9, 11],
  ]);
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('same conversation');
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('not saved');
});

test('instruction captions identify provider evidence and leave authorization to the application', () => {
  const report = { lesson: 'system-instructions', phases };

  const cues = workbenchOnboardingRecordingCues(report, 22);

  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('provider');
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('authorization');
});

test('onboarding captions reject missing or backwards evidence and respect measured duration', () => {
  const missing = { lesson: 'conversation', phases: { firstComplete: 2 } };
  const backwards = {
    lesson: 'first-plan',
    phases: { ...phases, returnedLive: 6 },
  };

  expect(() => workbenchOnboardingRecordingCues(missing, 22)).toThrow();
  expect(() => workbenchOnboardingRecordingCues(backwards, 22)).toThrow();
  expect(() =>
    workbenchOnboardingRecordingCues({ lesson: 'first-plan', phases }, 16),
  ).toThrow();
});

test('onboarding captions leave existing lessons to their existing recorder', () => {
  const report = { lesson: 'magic-text', phases };

  const result = workbenchOnboardingRecordingCues(report, 22);

  expect(result).toBeUndefined();
});

test.each(['first-plan', 'conversation', 'system-instructions'])(
  '%s keeps its short inspection caption readable at the measured hold',
  (lesson) => {
    const report = {
      lesson,
      phases: {
        firstComplete: 2,
        followup: 2.85,
        replay: lesson === 'first-plan' ? 2.85 : 6,
        returnedLive: 8,
      },
    };

    const cue = workbenchOnboardingRecordingCues(report, 20)?.[1];

    expect(cue).toBeDefined();
    if (!cue) throw new Error('Missing inspection caption');
    expect(cue[2].length / ((cue[1] - cue[0]) * 2)).toBeLessThanOrEqual(20);
  },
);
