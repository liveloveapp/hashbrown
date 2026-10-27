import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Builds truthful captions from measured agent, parser and form interactions. */
export function workbenchAuthoringRecordingCues(
  report: {
    readonly lesson: string;
    readonly phases: Readonly<Record<string, number>>;
    readonly agentFallbacks?: readonly boolean[];
    readonly agentConfidences?: readonly number[];
    readonly formFirstStepPreserved?: boolean;
  },
  encodedDuration: number,
): readonly WorkbenchRecordingCue[] | undefined {
  if (
    !['agent-decisions', 'json-parser', 'natural-forms'].includes(report.lesson)
  )
    return undefined;
  if (report.lesson === 'agent-decisions') {
    if (
      !report.agentFallbacks ||
      !report.agentConfidences ||
      report.agentFallbacks.length !== 2 ||
      report.agentConfidences.length !== 2 ||
      report.agentConfidences.some(
        (score, index) =>
          !Number.isFinite(score) ||
          score < 0 ||
          score > 1 ||
          report.agentFallbacks?.[index] !== score < 0.75,
      )
    )
      throw new Error(
        'Missing or inconsistent actual agent confidence policy evidence',
      );
  }
  if (report.lesson === 'natural-forms' && typeof report.formFirstStepPreserved !== 'boolean') {
    throw new Error('Missing actual form draft comparison evidence');
  }
  const steps =
    report.lesson === 'agent-decisions'
      ? [
          [
            'firstComplete',
            'TypeSafe returns a whole outline choice and confidence.',
          ],
          [
            'followup',
            report.agentFallbacks?.[0]
              ? 'Below 0.75, our clarification handler replies. State is unchanged.'
              : 'Our outline handler replies. Application state stays unchanged.',
          ],
          [
            'secondComplete',
            'The next whole decision proposes the record route.',
          ],
          [
            'replay',
            report.agentFallbacks?.[1]
              ? 'Below 0.75, clarification preserves application state.'
              : 'Our record handler replies from fixed application code.',
          ],
          [
            'returnedLive',
            'Replay makes no classifier requests or application writes.',
          ],
        ]
      : report.lesson === 'json-parser'
        ? [
            [
              'firstComplete',
              'OpenAI JSON feeds the actual framework parser as it arrives.',
            ],
            [
              'followup',
              'Source completion, parser completion and validation are separate.',
            ],
            [
              'secondComplete',
              'A new request replaces the preview with a shorter plan.',
            ],
            [
              'replay',
              'The completed document is validated against the original JSON.',
            ],
            [
              'returnedLive',
              'Replay follows captured JSON and values. No requests or writes.',
            ],
          ]
        : [
            [
              'firstComplete',
              'OpenAI reads current application context and generates a draft.',
            ],
            [
              'reviewed',
              'Review copies a completed valid draft into editable fields.',
            ],
            [
              'edited',
              'Edit the first step. The applied plan has not changed.',
            ],
            [
              'applied',
              'Apply validates reviewed values and advances application revision.',
            ],
            [
              'followup',
              'The next request uses readContext to read the applied plan.',
            ],
            [
              'secondComplete',
              report.formFirstStepPreserved
                ? 'A new draft preserves the edited first step. Review it again.'
                : 'The model rewrote the first step. Review catches the change.',
            ],
            ['secondReviewed', 'Review the new draft before applying.'],
            ['secondCorrected', report.formFirstStepPreserved
              ? 'Keep the first step. Applied state is unchanged.'
              : 'Restore the first step. Applied state is unchanged.'],
            ['secondApplied', 'Apply explicitly replaces the accepted plan.'],
            [
              'replay',
              'Generated data, reviewed fields and applied state stay separate.',
            ],
            [
              'returnedLive',
              'Replay makes no requests, edits or application writes.',
            ],
          ];
  let previous = 0;
  const cues: WorkbenchRecordingCue[] = steps.map(([name, text]) => {
    const to = report.phases[name],
      from = previous;
    if (
      !Number.isFinite(to) ||
      to <= from ||
      to > encodedDuration / 2 ||
      text.length / ((to - from) * 2) > 20
    )
      throw new Error(`Invalid or unreadable authoring phase: ${name}`);
    previous = to;
    return [from, to, text];
  });
  const end = encodedDuration / 2;
  if (
    !Number.isFinite(end) ||
    end <= previous ||
    10 / ((end - previous) * 2) > 20
  )
    throw new Error('Invalid authoring recording end');
  return [...cues, [previous, end, 'Back live.']];
}
