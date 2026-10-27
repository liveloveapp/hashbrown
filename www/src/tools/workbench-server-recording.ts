import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds readable captions from measured server conversation interactions. */
export function workbenchServerRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (!['server-threads', 'public-endpoint'].includes(report.lesson))
    return undefined;
  const steps =
    report.lesson === 'server-threads'
      ? [
          [
            'session',
            'Start a local demo session. Identity stays on the server.',
          ],
          ['loaded', 'Load Lighthouse before sending a request.'],
          ['firstComplete', 'OpenAI streams the named plan into text chat.'],
          ['saved', 'Save completed text with the loaded server version.'],
          ['refreshed', 'A browser refresh starts a fresh capture.'],
          ['restored', 'Load the saved thread. No model request.'],
          [
            'secondComplete',
            'The next request includes the saved conversation.',
          ],
          ['competing', 'Another client saves a newer server version.'],
          ['conflict', 'Save returns 409. Unsaved text stays visible.'],
          ['recovered', 'Reload explicitly adopts the newer server snapshot.'],
          ['replay', 'Review the actual HTTP operations and SDK messages.'],
          ['returnedLive', 'Replay makes no requests or writes.'],
        ]
      : [
          ['denied', 'An anonymous request returns 401 before provider work.'],
          ['authorized', 'Start a local demo session and load your thread.'],
          [
            'firstComplete',
            'An authorized request streams a real OpenAI reply.',
          ],
          ['foreign', 'A foreign thread returns 404 before provider work.'],
          ['replay', 'Inspect the actual statuses beside the conversation.'],
          ['returnedLive', 'Replay makes no requests or writes.'],
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
      throw new Error(`Invalid or unreadable server recording phase: ${name}`);
    previous = to;
    return [from, to, text];
  });
  const end = encodedDuration / 2;
  if (
    !Number.isFinite(end) ||
    end <= previous ||
    10 / ((end - previous) * 2) > 20
  )
    throw new Error('Invalid server recording end');
  return [...cues, [previous, end, 'Back live.']];
}
