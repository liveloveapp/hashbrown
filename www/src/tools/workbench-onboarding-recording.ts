import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds onboarding captions from the actual measured capture phases. */
export function workbenchOnboardingRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (
    !['first-plan', 'conversation', 'system-instructions'].includes(report.lesson)
  )
    return undefined;
  const phase = (name: string) => {
    const value = report.phases[name];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Missing or invalid recording phase: ${name}`);
    return value;
  };
  const complete = phase('firstComplete');
  const replay = phase('replay');
  const live = phase('returnedLive');
  const end = encodedDuration / 2;
  const cues: readonly WorkbenchRecordingCue[] =
    report.lesson === 'first-plan'
      ? [
          [0, complete, 'One request streams props into our trusted SummaryCard. No tools or application writes.'],
          [complete, replay, 'Preview only.'],
          [replay, live, 'Replay follows captured values without another request.'],
          [live, end, 'Back live. Preview only.'],
        ]
      : report.lesson === 'conversation'
        ? [
            [0, complete, 'A user names the plan. The assistant replies. Messages are not saved automatically.'],
            [complete, phase('followup'), 'Local history only.'],
            [phase('followup'), replay, 'A new run retains the same conversation and earlier messages.'],
            [replay, live, 'Replay follows captured turns without another request.'],
            [live, end, 'Back live. Same conversation.'],
          ]
        : [
            [0, complete, 'The endpoint replaces browser policy before calling the provider.'],
            [complete, phase('followup'), 'Mapped public policy.'],
            [phase('followup'), replay, 'The next turn keeps this server policy. Prompts do not grant authorization.'],
            [replay, live, 'Replay retains the captured provider evidence without another request.'],
            [live, end, 'Back live. No application writes.'],
          ];
  let previous = 0;
  for (const [from, to] of cues) {
    if (!Number.isFinite(end) || from < previous || to <= from || to > end)
      throw new Error('Recording phase order exceeds the encoded timeline');
    previous = to;
  }
  return cues;
}
