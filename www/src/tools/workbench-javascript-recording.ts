import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds captions from measured real sandbox actions, with no invented streaming. */
export function workbenchJavaScriptRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (report.lesson !== 'javascript-runtime') return undefined;
  const steps = [
    [
      'firstComplete',
      'QuickJS reads the plan and calculates 30 minutes. No model request.',
    ],
    [
      'secondComplete',
      'Change the estimate to 20 minutes. The plan stays unchanged.',
    ],
    [
      'rejected',
      'Browser access fails. Host arguments are validated explicitly.',
    ],
    ['recovered', 'Run again in a fresh context to recover.'],
    ['replay', 'Replay follows captured code, host calls and results.'],
    ['returnedLive', 'Playback executes no scripts or application writes.'],
  ];
  let previous = 0;
  const cues: WorkbenchRecordingCue[] = steps.map(([name, text]) => {
    const to = report.phases[name];
    const from = previous;
    if (
      !Number.isFinite(to) ||
      to <= from ||
      to > encodedDuration / 2 ||
      text.length / ((to - from) * 2) > 20
    )
      throw new Error(`Invalid or unreadable runtime phase: ${name}`);
    previous = to;
    return [from, to, text];
  });
  const end = encodedDuration / 2;
  if (
    !Number.isFinite(end) ||
    end <= previous ||
    10 / ((end - previous) * 2) > 20
  )
    throw new Error('Invalid runtime recording end');
  return [...cues, [previous, end, 'Back live.']];
}
