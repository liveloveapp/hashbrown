import { expect, test } from 'vitest';
import {
  workbenchWorkflowPosterTime,
  workbenchWorkflowRecordingCues,
} from '../src/tools/workbench-workflow-recording';

const phases = {
  firstRequest: 2,
  firstComplete: 4,
  paused: 3,
  resume: 5,
  resumedComplete: 7,
  followup: 8,
  replay: 11,
  returnedLive: 13,
};

test('shared-state captions separate local edits from generation and commit', () => {
  const report = { lesson: 'shared-state', phases };

  const cues = workbenchWorkflowRecordingCues(report, 28);

  expect(cues?.[0]).toEqual([0, 2, 'Set shared state. No generation yet.']);
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('committed state');
});

test('activity captions identify the agent as the producer of progress', () => {
  const report = { lesson: 'activities', phases };

  const cues = workbenchWorkflowRecordingCues(report, 28);

  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('agent');
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('activity ID');
  expect(cues?.map((cue) => cue[2]).join(' ')).not.toContain('video recorded');
});

test('interrupt captions keep resume in the same turn and distinguish the next batch', () => {
  const report = { lesson: 'interrupts', phases };

  const cues = workbenchWorkflowRecordingCues(report, 28);

  expect(cues?.map(([from, to]) => [from, to])).toEqual([
    [0, 3],
    [3, 5],
    [5, 7],
    [7, 8],
    [8, 11],
    [11, 13],
    [13, 14],
  ]);
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('same turn');
  expect(cues?.map((cue) => cue[2]).join(' ')).toContain('new approval batch');
});

test('workflow captions reject incomplete, backwards, and out-of-bounds timing evidence', () => {
  expect(() =>
    workbenchWorkflowRecordingCues({ lesson: 'interrupts', phases: {} }, 28),
  ).toThrow();
  expect(() =>
    workbenchWorkflowRecordingCues(
      { lesson: 'interrupts', phases: { ...phases, resume: 2 } },
      28,
    ),
  ).toThrow();
  expect(() =>
    workbenchWorkflowRecordingCues({ lesson: 'activities', phases }, 20),
  ).toThrow();
});

test('workflow captions leave other lessons to their existing caption builders', () => {
  const report = { lesson: 'first-plan', phases };

  const result = workbenchWorkflowRecordingCues(report, 28);

  expect(result).toBeUndefined();
});

test.each(['shared-state', 'activities', 'interrupts'])(
  '%s keeps the short completed-state cue readable',
  (lesson) => {
    const report = {
      lesson,
      phases: { ...phases, firstComplete: 7, followup: 7.7 },
    };

    const cues = workbenchWorkflowRecordingCues(report, 28);
    const cue = cues?.find(([from, to]) => from === 7 && to === 7.7);

    expect(cue).toBeDefined();
    if (!cue) throw new Error('Missing completed-state cue');
    expect(cue[2].length / ((cue[1] - cue[0]) * 2)).toBeLessThanOrEqual(20);
  },
);

test('workflow posters settle after the captured pause or completion', () => {
  expect(
    workbenchWorkflowPosterTime({ lesson: 'interrupts', phases }, 28),
  ).toBe(6.6);
  expect(
    workbenchWorkflowPosterTime({ lesson: 'activities', phases }, 28),
  ).toBe(8.6);
  expect(
    workbenchWorkflowPosterTime({ lesson: 'shared-state', phases }, 28),
  ).toBe(8.6);
  expect(
    workbenchWorkflowPosterTime({ lesson: 'first-plan', phases }, 28),
  ).toBeUndefined();
});

test('workflow poster time is bounded and requires a valid measured phase', () => {
  expect(
    workbenchWorkflowPosterTime({ lesson: 'activities', phases }, 8.2),
  ).toBeCloseTo(8.1);
  expect(() =>
    workbenchWorkflowPosterTime({ lesson: 'activities', phases: {} }, 28),
  ).toThrow();
});
