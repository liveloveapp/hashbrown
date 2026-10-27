import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds captions from measured kit selection, explicit acceptance and read-only playback. */
export function workbenchUiRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (!['ui-kits', 'ui-chatbot'].includes(report.lesson)) return undefined;
  const steps = [
    [
      'firstComplete',
      'Real OpenAI output selects a component from our trusted kit.',
    ],
    ['firstAccepted', 'Only Accept plan changes application state.'],
    ['followup', 'Next, readContext will supply the accepted plan.'],
    [
      'secondComplete',
      report.lesson === 'ui-kits'
        ? 'The next response renders StepsCard from the same kit.'
        : 'PlanReading reports the accepted plan. It has no write action.',
    ],
    ...(report.lesson === 'ui-kits'
      ? [
          [
            'secondAccepted',
            'Accept the revised proposal to update application state.',
          ],
        ]
      : []),
    ['replay', 'Replay follows captured components and state.'],
    ['returnedLive', 'No requests or application writes during replay.'],
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
    ) {
      throw new Error(`Invalid or unreadable UI lesson phase: ${name}`);
    }
    previous = to;
    return [from, to, text];
  });
  const end = encodedDuration / 2;
  if (
    !Number.isFinite(end) ||
    end <= previous ||
    10 / ((end - previous) * 2) > 20
  ) {
    throw new Error('Invalid UI lesson recording end');
  }
  return [...cues, [previous, end, 'Back live.']];
}
