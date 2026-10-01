import { expect, test } from 'vitest';
import { median, parseServerTiming, type PerfRun, summarize } from './stats';

test('median handles odd, even and empty inputs', () => {
  const values = [median([5, 1, 3]), median([4, 1, 3, 2]), median([])];

  expect(values.slice(0, 2)).toEqual([3, 2.5]);
  expect(values[2]).toBeNaN();
});

test('parseServerTiming reads each phase duration', () => {
  const header = 'init;dur=3.1, session;dur=0.4, snapshot;dur=12.0';

  const phases = parseServerTiming(header);

  expect(phases).toEqual({ init: 3.1, session: 0.4, snapshot: 12 });
  expect(parseServerTiming(null)).toEqual({});
});

test('summarize prints the medians as a Markdown table', () => {
  const run = (scale: number): PerfRun => ({
    dashboardData: 400 * scale,
    snapshotServer: { snapshot: 10 * scale },
    questions: [
      { question: 'Q', firstText: 9000 * scale, settled: 12000 * scale },
    ],
    approvalCard: 11000 * scale,
    applied: 8000 * scale,
  });

  const table = summarize([run(1), run(2), run(3)]);

  expect(table.split('\n')).toEqual([
    '| Moment (median of 3) | Time |',
    '| --- | --- |',
    '| Dashboard data | 0.80 s |',
    '| Snapshot server: snapshot | 0.02 s |',
    '| First answer text: Q | 18.00 s |',
    '| Settled answer: Q | 24.00 s |',
    '| Approval card | 22.00 s |',
    '| Approve to applied | 16.00 s |',
  ]);
});
