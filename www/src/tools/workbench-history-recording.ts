import type { WorkbenchRecordingCue } from './workbench-recording-cues';

type Report = {
  readonly lesson: string;
  readonly phases: Readonly<Record<string, number>>;
};
const history = (lesson: string) =>
  ['message-history', 'save-text-conversations'].includes(lesson);

/** Builds captions from continuous measured phases, enforcing readability at half speed. */
export function workbenchHistoryRecordingCues(
  report: Report,
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (!history(report.lesson)) return undefined;
  const steps =
    report.lesson === 'message-history'
      ? [
          ['firstComplete', 'OpenAI replies with the named plan.'],
          ['keep', 'Keep completed text in application memory.'],
          ['clear', 'Clear actual SDK messages. No request.'],
          ['restore', 'Restore text with fresh SDK message IDs.'],
          ['followup', 'Restored text alone cannot be saved.'],
          ['replay', 'A new OpenAI request remembers Lighthouse.'],
          ['returnedLive', 'Replay is read-only. No requests or writes.'],
        ]
      : [
          ['firstSave', 'OpenAI replies. Explicitly Save Lighthouse text.'],
          ['harbor', 'New conversation. Select Harbor.'],
          ['secondSave', 'Name Harbor, then explicitly Save its reply.'],
          ['reload', 'Two independent browser text documents.'],
          ['load', 'Reload clears SDK identity and captured events.'],
          ['followup', 'Load Lighthouse text. No request or write.'],
          ['finalSave', 'OpenAI remembers Lighthouse. Explicitly Save.'],
          ['replay', 'Only this page’s captured events are replayed.'],
          ['returnedLive', 'Replay is read-only. No requests or writes.'],
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
      throw new Error(`Invalid or unreadable recording phase: ${name}`);
    previous = to;
    return [from, to, text];
  });
  const end = encodedDuration / 2;
  if (
    !Number.isFinite(end) ||
    end <= previous ||
    'Back live.'.length / ((end - previous) * 2) > 20
  )
    throw new Error('Invalid recording end');
  return [...cues, [previous, end, 'Back live.']];
}

/** Chooses a settled frame after the restored follow-up, within the encoded timeline. */
export function workbenchHistoryPosterTime(
  report: Report,
  encodedDuration: number,
): number | undefined {
  if (!history(report.lesson)) return undefined;
  const complete = report.phases['secondComplete'];
  if (
    !Number.isFinite(complete) ||
    complete < 0 ||
    !Number.isFinite(encodedDuration) ||
    encodedDuration <= complete * 2 + 0.1
  )
    throw new Error('Invalid history poster timing');
  return Math.min(encodedDuration - 0.1, (complete + 0.3) * 2);
}
