import { expect, test } from 'vitest';
import { workbenchHistoryFixtureText } from '../src/tools/workbench-history-fixture';
import {
  workbenchHistoryPosterTime,
  workbenchHistoryRecordingCues,
} from '../src/tools/workbench-history-recording';

const phases = {
  firstComplete: 5,
  keep: 8,
  clear: 11,
  restore: 14,
  firstSave: 8,
  harbor: 11,
  secondSave: 16,
  reload: 19,
  load: 23,
  followup: 27,
  secondComplete: 31,
  finalSave: 34,
  replay: 38,
  returnedLive: 42,
};

test('history fixtures remember the supplied name from retained request messages', () => {
  const messages = [
    { role: 'user', content: 'Name this plan Harbor.' },
    { role: 'assistant', content: 'Harbor is ready.' },
    { role: 'user', content: 'What is its name?' },
  ];

  const text = workbenchHistoryFixtureText('save-text-conversations', messages);

  expect(text).toContain('Harbor');
  expect(text).toContain('record');
  expect(
    workbenchHistoryFixtureText('message-history', [
      { role: 'user', content: 'Name it Lighthouse.' },
    ]),
  ).toContain('Lighthouse');
  expect(workbenchHistoryFixtureText('tools', messages)).toBeUndefined();
});

test.each(['message-history', 'save-text-conversations'])(
  '%s measured captions remain readable after half speed',
  (lesson) => {
    const report = { lesson, phases };

    const cues = workbenchHistoryRecordingCues(report, 90);

    expect(cues).toBeDefined();
    for (const [from, to, text] of cues ?? [])
      expect(text.length / ((to - from) * 2)).toBeLessThanOrEqual(20);
    expect(cues?.map((cue) => cue[2]).join(' ')).toContain('Replay');
    expect(workbenchHistoryPosterTime(report, 90)).toBeGreaterThan(
      phases.secondComplete * 2,
    );
  },
);

test('saved captions explicitly describe reload and manual text load', () => {
  const report = { lesson: 'save-text-conversations', phases };

  const text = workbenchHistoryRecordingCues(report, 90)
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('Reload');
  expect(text).toContain('Load');
  expect(text).toContain('OpenAI');
  expect(text).not.toContain('agent');
});

test('history captions reject missing, reversed and unreadably brief measured phases', () => {
  const report = { lesson: 'message-history', phases };

  expect(() =>
    workbenchHistoryRecordingCues({ ...report, phases: {} }, 90),
  ).toThrow();
  expect(() =>
    workbenchHistoryRecordingCues(
      { ...report, phases: { ...phases, clear: 7 } },
      90,
    ),
  ).toThrow();
  expect(() =>
    workbenchHistoryRecordingCues(
      { ...report, phases: { ...phases, keep: 5.01 } },
      90,
    ),
  ).toThrow();
  expect(
    workbenchHistoryRecordingCues({ lesson: 'tools', phases }, 90),
  ).toBeUndefined();
  expect(
    workbenchHistoryPosterTime({ lesson: 'tools', phases }, 90),
  ).toBeUndefined();
});

test('history fixture does not invent a remembered name absent from supplied messages', () => {
  const messages = [{ role: 'user', content: 'Explain the two-step plan.' }];

  const text = workbenchHistoryFixtureText('message-history', messages);

  expect(text).toContain('record');
  expect(text).not.toMatch(/Lighthouse|Harbor/);
});
