/** One caption interval in original capture seconds, converted to half-speed time by the encoder. */
export type WorkbenchRecordingCue = readonly [
  from: number,
  to: number,
  text: string,
];

/** Builds truthful recipe captions from measured phases and rejects incomplete or backwards evidence. */
export function workbenchRecipeRecordingCues(
  report: {
    readonly lesson: string;
    readonly firstManualChoice?: boolean;
    readonly phases: Readonly<Record<string, number>>;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (!['prose', 'predictions', 'ui-selection'].includes(report.lesson))
    return undefined;
  if (
    report.lesson === 'ui-selection' &&
    typeof report.firstManualChoice !== 'boolean'
  )
    throw new Error('Missing recorded first-selection policy evidence');
  const phase = (name: string): number => {
    const value = report.phases[name];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Missing or invalid recording phase: ${name}`);
    return value;
  };
  const complete = phase('firstComplete'),
    followup = phase('followup'),
    replay = phase('replay'),
    live = phase('returnedLive');
  const end = encodedDuration / 2;
  const cues: readonly WorkbenchRecordingCue[] =
    report.lesson === 'prose'
      ? [
          [
            0,
            complete,
            'Real text chat streams Markdown. Prose renders headings, emphasis and list items as the reply arrives.',
          ],
          [
            complete,
            followup,
            'Open citation. A reference is not verification.',
          ],
          [
            followup,
            replay,
            'A follow-up shortens the same conversation. Explaining the plan does not change application state.',
          ],
          [
            replay,
            live,
            'Replay shows Markdown and state. No requests or writes.',
          ],
          [live, end, 'Back live. The plan remains at revision 0.'],
        ]
      : report.lesson === 'predictions'
        ? [
            [
              0,
              complete,
              'A completion proposes known action IDs for this context. Partial output cannot apply them.',
            ],
            [
              complete,
              phase('accept'),
              'Dismiss the first proposal, then request fresh suggestions. The application revision stays at 0.',
            ],
            [phase('accept'), followup, 'Accept: revision 1.'],
            [
              followup,
              replay,
              'A fresh snapshot includes the accepted action and suggests a review.',
            ],
            [
              replay,
              live,
              'Replay proposals and state. No requests or writes.',
            ],
            [live, end, 'Back live. Revision 1.'],
          ]
        : [
            [0, complete, 'TypeSafe: whole choice and confidence.'],
            [
              complete,
              followup,
              report.firstManualChoice
                ? 'Show summary manually. Revision 1.'
                : 'Use view: summary saved at revision 1.',
            ],
            [followup, phase('manual'), 'Confidence gates the preview.'],
            [phase('manual'), replay, 'Show steps. Revision 2.'],
            [replay, live, 'Replay: no requests or writes.'],
            [live, end, 'Back live. Revision 2.'],
          ];
  let previous = 0;
  for (const [from, to] of cues) {
    if (!Number.isFinite(end) || from < previous || to <= from || to > end)
      throw new Error('Recording phase order exceeds the encoded timeline');
    previous = to;
  }
  return cues;
}

/** Rejects invalid intervals and captions above 17 characters per encoded second. */
export function validateWorkbenchRecordingCues(
  cues: readonly WorkbenchRecordingCue[],
  duration: number,
  timingScale: number,
): void {
  if (
    !cues.length ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(timingScale) ||
    timingScale <= 0
  )
    throw new Error('Invalid caption timeline.');
  let previous = 0;
  for (const [from, to, text] of cues) {
    const start = Math.round(from * timingScale * 1000) / 1000;
    const end = Math.round(to * timingScale * 1000) / 1000;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < previous ||
      end <= start ||
      end > duration + 0.001 ||
      !text.trim() ||
      text.length / (end - start) > 17
    )
      throw new Error(`Unreadable or invalid caption: ${text}`);
    previous = end;
  }
}
