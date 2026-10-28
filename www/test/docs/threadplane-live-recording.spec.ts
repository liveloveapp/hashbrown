import { expect, test } from 'vitest';
import {
  threadplaneLiveRecordingCues,
  threadplaneLiveSettings,
} from '../../src/tools/docs-threadplane-live-recording';

test('live footage requires explicit real provider configuration and rejects fixture publication', () => {
  expect(() => threadplaneLiveSettings({})).toThrow(/OPENAI_API_KEY/);
  expect(() => threadplaneLiveSettings({ OPENAI_API_KEY: 'private' })).toThrow(
    /OPENAI_MODEL/,
  );
  expect(() =>
    threadplaneLiveSettings({
      OPENAI_API_KEY: 'private',
      OPENAI_MODEL: 'model',
      DOCS_THREADPLANE_FIXTURE: '1',
    }),
  ).toThrow(/fixture/);

  const settings = threadplaneLiveSettings({
    OPENAI_API_KEY: 'private',
    OPENAI_MODEL: 'model',
  });

  expect(settings).toEqual({ apiKey: 'private', model: 'model', record: true });
});

test('captions follow measured real phases and reject unreadable or incomplete evidence', () => {
  const phases = {
    firstComplete: 8,
    followup: 12,
    secondComplete: 18,
    inspected: 22,
    replay: 27,
    returnedLive: 31,
  };

  const cues = threadplaneLiveRecordingCues(phases, 34);

  expect(cues).toHaveLength(7);
  expect(cues[0]).toEqual([
    0,
    8,
    'Threadplane shows the real streaming reply.',
  ]);
  expect(cues.at(-1)).toEqual([31, 34, 'Back live. State is unchanged.']);
  expect(() =>
    threadplaneLiveRecordingCues({ ...phases, replay: 18 }, 34),
  ).toThrow(/phase/);
  expect(() =>
    threadplaneLiveRecordingCues({ ...phases, returnedLive: NaN }, 34),
  ).toThrow(/phase/);
  expect(() => threadplaneLiveRecordingCues(phases, 31.2)).toThrow(/caption/);
});

test('incremental evidence requires multiple actual growing content deltas for each turn', async () => {
  const { threadplaneIncrementalEvidence } =
    await import('../../src/tools/docs-threadplane-live-recording');
  const frames = [
    {
      turn: 1,
      kind: 'event',
      payload: { type: 'TEXT_MESSAGE_CONTENT', delta: 'A' },
      json: 'A',
    },
    {
      turn: 1,
      kind: 'event',
      payload: { type: 'TEXT_MESSAGE_END' },
      json: 'A',
    },
    { turn: 1, kind: 'event', payload: { type: 'RUN_FINISHED' }, json: 'A' },
  ];

  expect(() => threadplaneIncrementalEvidence(frames, 1)).toThrow(
    /incremental/,
  );
  expect(
    threadplaneIncrementalEvidence(
      [
        ...frames.slice(0, 1),
        {
          turn: 1,
          kind: 'event',
          payload: { type: 'TEXT_MESSAGE_CONTENT', delta: 'B' },
          json: 'AB',
        },
      ],
      1,
    ),
  ).toEqual({ turn: 1, deltas: 2, finalLength: 2 });
  expect(() => threadplaneIncrementalEvidence(frames, 2)).toThrow(
    /incremental/,
  );
});
