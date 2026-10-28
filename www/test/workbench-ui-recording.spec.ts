import { expect, test } from 'vitest';
import { workbenchUiRecordingCues } from '../src/tools/workbench-ui-recording';

const phases = {
  firstComplete: 8,
  firstAccepted: 11,
  followup: 14,
  secondComplete: 22,
  secondAccepted: 25,
  replay: 28,
  returnedLive: 35,
};

test.each(['ui-kits', 'ui-chatbot'])(
  '%s captions follow measured source, acceptance and replay boundaries',
  (lesson) => {
    const cues = workbenchUiRecordingCues({ lesson, phases }, 80);

    expect(cues).toBeDefined();
    const text = cues?.map((cue) => cue[2]).join(' ');
    expect(text).toContain('Accept plan');
    expect(text).toContain('readContext');
    expect(text).toContain('Replay');
    for (const [from, to, caption] of cues ?? []) {
      expect(to).toBeGreaterThan(from);
      expect(to).toBeLessThanOrEqual(40);
      expect(caption.length / ((to - from) * 2)).toBeLessThanOrEqual(20);
    }
  },
);

test('kit captions show the second trusted component and explicit second acceptance', () => {
  const text = workbenchUiRecordingCues({ lesson: 'ui-kits', phases }, 80)
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('StepsCard');
  expect(text).toContain('revised proposal');
  expect(text).not.toContain('PlanReading');
});

test('chatbot captions separate the read-only report from the authoritative application state', () => {
  const text = workbenchUiRecordingCues({ lesson: 'ui-chatbot', phases }, 80)
    ?.map((cue) => cue[2])
    .join(' ');

  expect(text).toContain('PlanReading');
  expect(text).toContain('no write action');
  expect(text).not.toContain('revised proposal');
});

test('rejects missing or unreadable phases instead of manufacturing timing', () => {
  expect(() =>
    workbenchUiRecordingCues({ lesson: 'ui-kits', phases: {} }, 80),
  ).toThrow();
  expect(() =>
    workbenchUiRecordingCues(
      { lesson: 'ui-kits', phases: { ...phases, firstAccepted: 8.01 } },
      80,
    ),
  ).toThrow();
  expect(() =>
    workbenchUiRecordingCues({ lesson: 'ui-chatbot', phases }, 60),
  ).toThrow();
  expect(
    workbenchUiRecordingCues({ lesson: 'tools', phases }, 80),
  ).toBeUndefined();
});
