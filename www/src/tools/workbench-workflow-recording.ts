import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds workflow captions from measured phases, distinguishing agent events from model output. */
export function workbenchWorkflowRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (!['shared-state', 'activities', 'interrupts'].includes(report.lesson))
    return undefined;
  const phase = (name: string) => {
    const value = report.phases[name];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Missing or invalid recording phase: ${name}`);
    return value;
  };
  const followup = phase('followup');
  const replay = phase('replay');
  const live = phase('returnedLive');
  const end = encodedDuration / 2;
  const cues: readonly WorkbenchRecordingCue[] =
    report.lesson === 'shared-state'
      ? [
          [0, phase('firstRequest'), 'Set shared state. No generation yet.'],
          [
            phase('firstRequest'),
            phase('firstComplete'),
            'The agent sends state updates around a real streamed reply.',
          ],
          [phase('firstComplete'), followup, 'State committed.'],
          [followup, replay, 'The next request carries the committed state.'],
          [replay, live, 'Read-only replay.'],
          [live, end, 'Back live.'],
        ]
      : report.lesson === 'activities'
        ? [
            [
              0,
              phase('firstComplete'),
              'The agent reports actual work as activity messages.',
            ],
            [phase('firstComplete'), followup, 'Reply complete.'],
            [followup, replay, 'Another turn creates a new activity ID.'],
            [replay, live, 'Read-only replay.'],
            [live, end, 'Back live.'],
          ]
        : [
            [
              0,
              phase('paused'),
              'A real reply pauses for two approval questions.',
            ],
            [
              phase('paused'),
              phase('resume'),
              'Answer the complete batch before resuming.',
            ],
            [
              phase('resume'),
              phase('resumedComplete'),
              'Resume sends both answers and continues the same turn.',
            ],
            [phase('resumedComplete'), followup, 'Resume complete.'],
            [followup, replay, 'A new turn gets a new approval batch.'],
            [replay, live, 'Read-only replay.'],
            [live, end, 'Back live. Paused.'],
          ];
  let previous = 0;
  for (const [from, to] of cues) {
    if (!Number.isFinite(end) || from < previous || to <= from || to > end)
      throw new Error('Recording phase order exceeds the encoded timeline');
    previous = to;
  }
  return cues;
}

/** Chooses a settled workflow poster frame after the observed UI milestone. */
export function workbenchWorkflowPosterTime(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): number | undefined {
  if (!['shared-state', 'activities', 'interrupts'].includes(report.lesson))
    return undefined;
  const phase =
    report.phases[report.lesson === 'interrupts' ? 'paused' : 'firstComplete'];
  if (
    !Number.isFinite(phase) ||
    phase < 0 ||
    !Number.isFinite(encodedDuration) ||
    encodedDuration <= 0.1
  )
    throw new Error('Invalid workflow poster timing');
  return Math.min(encodedDuration - 0.1, (phase + 0.3) * 2);
}
