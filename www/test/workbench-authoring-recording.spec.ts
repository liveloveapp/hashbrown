import { expect, test } from 'vitest';
import { workbenchAuthoringRecordingCues } from '../src/tools/workbench-authoring-recording';

const phases = {
  firstComplete: 8,
  reviewed: 12,
  edited: 15,
  applied: 18,
  followup: 22,
  secondComplete: 29,
  secondReviewed: 32,
  secondCorrected: 33.5,
  secondApplied: 35,
  replay: 39,
  returnedLive: 44,
};

test.each(['agent-decisions', 'json-parser', 'natural-forms'])(
  '%s captions use measured phases and truthful teaching boundaries',
  (lesson) => {
    const cues = workbenchAuthoringRecordingCues(
      {
        lesson,
        phases,
        ...(lesson === 'natural-forms' ? { formFirstStepPreserved: true } : {}),
        ...(lesson === 'agent-decisions'
          ? { agentFallbacks: [false, false], agentConfidences: [0.9, 0.9] }
          : {}),
      },
      96,
    );

    expect(cues).toBeDefined();
    expect(cues?.map((cue) => cue[2]).join(' ')).toContain('Replay');
    for (const [from, to, text] of cues ?? []) {
      expect(to).toBeGreaterThan(from);
      expect(text.length / ((to - from) * 2)).toBeLessThanOrEqual(20);
    }
  },
);

test('agent captions describe whole decisions and application handler text', () => {
  const text = workbenchAuthoringRecordingCues(
    {
      lesson: 'agent-decisions',
      phases,
      agentFallbacks: [false, false],
      agentConfidences: [0.9, 0.9],
    },
    96,
  )
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('TypeSafe');
  expect(text).toContain('handler');
  expect(text).toContain('whole');
  expect(text).not.toContain('OpenAI');
});

test('form captions separate editing and explicit application', () => {
  const text = workbenchAuthoringRecordingCues(
    { lesson: 'natural-forms', phases, formFirstStepPreserved: true },
    96,
  )
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('Review');
  expect(text).toContain('Edit');
  expect(text).toContain('Apply');
  expect(text).toContain('readContext');
});

test('captions reject absent phases and unreadably short intervals', () => {
  expect(() =>
    workbenchAuthoringRecordingCues(
      { lesson: 'natural-forms', phases: {} },
      96,
    ),
  ).toThrow();
  expect(() =>
    workbenchAuthoringRecordingCues(
      { lesson: 'natural-forms', phases: { ...phases, reviewed: 8.01 } },
      96,
    ),
  ).toThrow();
  expect(
    workbenchAuthoringRecordingCues({ lesson: 'tools', phases }, 96),
  ).toBeUndefined();
});

test('agent captions disclose actual below-threshold clarification without changing policy', () => {
  const text = workbenchAuthoringRecordingCues(
    {
      lesson: 'agent-decisions',
      phases,
      agentFallbacks: [true, false],
      agentConfidences: [0.74, 0.9],
    },
    96,
  )
    ?.map((c) => c[2])
    .join(' ');

  expect(text).toContain('Below 0.75');
  expect(text).toContain('clarification handler');
  expect(text).not.toContain('Our outline handler replies');
  expect(() =>
    workbenchAuthoringRecordingCues({ lesson: 'agent-decisions', phases }, 96),
  ).toThrow();
  expect(() =>
    workbenchAuthoringRecordingCues(
      {
        lesson: 'agent-decisions',
        phases,
        agentFallbacks: [false, false],
        agentConfidences: [0.74, 0.9],
      },
      96,
    ),
  ).toThrow();
});

test('forms captions disclose an actual rewritten step and the user correction', () => {
  const report = {
    lesson: 'natural-forms',
    phases: { ...phases, secondCorrected: 33.5 },
    formFirstStepPreserved: false,
  };

  const text = workbenchAuthoringRecordingCues(report, 96)
    ?.map((cue) => cue[2]).join(' ');

  expect(text).toContain('rewrote');
  expect(text).toContain('Restore');
  expect(text).not.toContain('preserves the edited first step');
  expect(() => workbenchAuthoringRecordingCues(
    { lesson: 'natural-forms', phases }, 96,
  )).toThrow();
});
