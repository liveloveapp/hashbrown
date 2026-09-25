import { expect, test } from 'vitest';
import { concatList, retime, type Timeline } from './timeline';

const timeline: Timeline = {
  frames: [
    { file: 'f0.jpg', t: 100.2 },
    { file: 'f1.jpg', t: 101 },
    { file: 'f2.jpg', t: 104 },
    { file: 'f3.jpg', t: 130 },
  ],
  markers: [
    { t: 100, speed: 1, label: 'intro' },
    { t: 102, speed: 8, label: 'thinking' },
    { t: 110, speed: 1.6, label: 'streaming' },
    { t: 122, speed: 1, label: 'settled' },
    { t: 124, speed: 0, label: 'end' },
  ],
};

test('concatList holds the first frame from the first marker and drops frames after the end', () => {
  const list = concatList(timeline, '/frames');

  expect(list).toBe(
    [
      'ffconcat version 1.0',
      "file '/frames/f0.jpg'",
      'duration 1.0000',
      "file '/frames/f1.jpg'",
      'duration 3.0000',
      "file '/frames/f2.jpg'",
      'duration 20.0000',
      "file '/frames/f2.jpg'",
    ].join('\n'),
  );
});

test('retime speeds each span by its marker and caps streaming screen time', () => {
  const { segments } = retime(timeline, { streamMax: 3 });

  expect(segments).toEqual([
    { start: 0, end: 2, speed: 1 },
    { start: 2, end: 10, speed: 8 },
    { start: 10, end: 22, speed: 4 },
    { start: 22, end: 24, speed: 1 },
  ]);
});

test('retime merges adjacent fast-forwarded spans in output time', () => {
  const { fast, length } = retime(timeline, { streamMax: 3 });

  expect(fast).toEqual([[2, 6]]);
  expect(length).toBe(8);
});

test('retime keeps slow streaming at its own speed', () => {
  const short: Timeline = {
    ...timeline,
    markers: [
      { t: 100, speed: 1.6, label: 'streaming' },
      { t: 102, speed: 0, label: 'end' },
    ],
  };

  const { segments } = retime(short, { streamMax: 3 });

  expect(segments).toEqual([{ start: 0, end: 2, speed: 1.6 }]);
});
