import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Keeps native inference footage and captions at actual elapsed speed. */
export function workbenchLocalRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  duration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (report.lesson !== 'local-models') return undefined;
  const steps = [
    ['prepared', 'Prepare the available native model.'],
    ['firstComplete', 'Chrome generates a typed plan locally.'],
    ['firstAccepted', 'Accept plan commits revision one.'],
    ['secondComplete', 'The next turn receives accepted state.'],
    ['secondAccepted', 'Accept the revision explicitly.'],
    ['replay', 'Replay follows captured local output.'],
    ['returnedLive', 'Replay opens no native sessions.'],
  ];
  let previous = 0;
  const cues: WorkbenchRecordingCue[] = steps.map(([name, caption]) => {
    const to = report.phases[name],
      from = previous;
    if (
      !Number.isFinite(to) ||
      to <= from ||
      to > duration ||
      caption.length / (to - from) > 20
    )
      throw new Error(`Unreadable native phase: ${name}`);
    previous = to;
    return [from, to, caption];
  });
  if (
    !Number.isFinite(duration) ||
    duration <= previous ||
    10 / (duration - previous) > 20
  )
    throw new Error('Unreadable native recording end');
  return [...cues, [previous, duration, 'Back live.']];
}
