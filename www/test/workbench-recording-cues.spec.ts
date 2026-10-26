import { expect, test } from 'vitest';
import { workbenchRecipeRecordingCues } from '../src/tools/workbench-recording-cues';

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
  const report = { lesson: 'magic-text', phases: { firstComplete: 2 } };

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
