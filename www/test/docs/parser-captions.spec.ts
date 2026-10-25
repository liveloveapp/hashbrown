import { expect, test } from 'vitest';
import { createParserCaptions } from '../../src/tools/docs-parser-captions';

test('parser captions coalesce short observed phases into readable bounded cues', () => {
  const phases = [
    {
      seconds: 0.441,
      text: 'Start the finite local JSON stream. No weather API or model is called.',
    },
    {
      seconds: 1.259,
      text: 'The city waits for its closing quote; the streaming forecast grows earlier.',
    },
    {
      seconds: 1.686,
      text: 'Stop cancels the owned stream. A partial preview is not a valid document.',
    },
    { seconds: 2.899, text: 'Reset clears the stopped stream and preview.' },
    { seconds: 3.918, text: 'Start a new stream explicitly to recover.' },
    {
      seconds: 6.813,
      text: 'An alert appears once its required field values are complete.',
    },
    {
      seconds: 7.605,
      text: 'Source EOF, parser completion and final validation establish a complete valid document.',
    },
  ];

  const vtt = createParserCaptions(phases, 14.533);
  const cues = vtt
    .trim()
    .split('\n\n')
    .slice(1)
    .map((block) => {
      const [timing, text] = block.split('\n');
      const seconds = (stamp: string) => {
        const [hours, minutes, seconds] = stamp.split(':').map(Number);
        return hours * 3600 + minutes * 60 + seconds;
      };
      const [start, end] = timing.split(' --> ').map(seconds);
      return { start, end, text };
    });

  expect(vtt).toMatch(/^WEBVTT\n\n/);
  expect(cues).toEqual([
    { start: 0, end: 2, text: 'Preview of the completed interaction.' },
    { start: 2, end: 3.686, text: 'Start a local JSON stream.' },
    { start: 3.686, end: 4.899, text: 'Stop keeps a partial preview.' },
    { start: 4.899, end: 5.918, text: 'Reset clears the preview.' },
    { start: 5.918, end: 8.813, text: 'Start again.' },
    {
      start: 8.813,
      end: 14.533,
      text: 'Fields resolve. Validate the finished document.',
    },
  ]);
  for (const [index, cue] of cues.entries()) {
    expect(cue.end - cue.start).toBeGreaterThanOrEqual(1);
    expect(cue.start).toBeGreaterThanOrEqual(cues[index - 1]?.end ?? 0);
    expect(cue.end).toBeLessThanOrEqual(14.533);
  }
});
