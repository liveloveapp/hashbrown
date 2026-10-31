import { expect, test } from 'vitest';
import {
  validateWorkbenchRecordingCues,
  workbenchRecipeRecordingCues,
} from '../src/tools/workbench-recording-cues';

const phases = {
  firstComplete: 2,
  followup: 4,
  accept: 3,
  manual: 5,
  replay: 6,
  returnedLive: 8,
};

test('uses measured phase times for whole decisions and keeps every cue inside encoded duration', () => {
  const report = { lesson: 'ui-selection', phases, firstManualChoice: false };

  const cues = workbenchRecipeRecordingCues(report, 20);

  expect(cues?.map(([from, to]) => [from, to])).toEqual([
    [0, 2],
    [2, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [8, 10],
  ]);
  expect(cues?.[0][2]).toContain('whole');
  expect(cues?.[0][2]).not.toContain('streams');
});

test('rejects missing phase evidence instead of publishing incomplete recipe captions', () => {
  const report = { lesson: 'prose', phases: { firstComplete: 2 } };

  expect(() => workbenchRecipeRecordingCues(report, 20)).toThrow('followup');
});

test('rejects out-of-order capture phases instead of creating backwards caption cues', () => {
  const report = { lesson: 'predictions', phases: { ...phases, accept: 1 } };

  expect(() => workbenchRecipeRecordingCues(report, 20)).toThrow('phase');
});

test('describes actual manual selection instead of claiming a model result was applied', () => {
  const report = { lesson: 'ui-selection', phases, firstManualChoice: true };

  const cues = workbenchRecipeRecordingCues(report, 20);

  expect(cues?.[1][2]).toContain('Show summary manually');
  expect(cues?.[1][2]).not.toContain('Use view');
});

test('validates encoded caption reading speed at the actual footage scale', () => {
  const cues = [[0, 1, 'A readable caption.']] as const;

  expect(() => validateWorkbenchRecordingCues(cues, 2, 2)).not.toThrow();
  expect(() => validateWorkbenchRecordingCues(cues, 0.5, 0.5)).toThrow(
    /caption/,
  );
});

test('rejects invalid caption intervals instead of dropping or clamping them', () => {
  for (const cues of [
    [[0, NaN, 'Caption']],
    [[1, 1, 'Caption']],
    [
      [0, 2, 'Caption'],
      [1, 3, 'Overlap'],
    ],
    [[0, 4, 'Beyond the video']],
    [[0, 1, '']],
  ] as const) {
    expect(() => validateWorkbenchRecordingCues(cues, 3, 1)).toThrow(/caption/);
  }
  expect(() => validateWorkbenchRecordingCues([], 3, 1)).toThrow(/caption/);
});

test('leaves time to inspect the UI while reading captions', () => {
  const cues = [[0, 2, 'A caption that takes too much attention.']] as const;

  expect(() => validateWorkbenchRecordingCues(cues, 2, 1)).toThrow(/caption/);
});
