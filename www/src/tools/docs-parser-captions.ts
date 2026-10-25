import type { RecipePhase } from './docs-recipe-browser';

/** Coalesces measured parser phases into short, readable recording captions. */
export function createParserCaptions(
  phases: readonly RecipePhase[],
  duration: number,
): string {
  const measured = (prefix: string): number => {
    const phase = phases.find((phase) => phase.text.startsWith(prefix));
    if (!phase || !Number.isFinite(phase.seconds) || phase.seconds < 0)
      throw new Error(`Missing measured parser phase: ${prefix}`);
    return Math.round((phase.seconds + 2) * 1000) / 1000;
  };
  // The introductory hold and short city/alert explanations share nearby cues.
  // Action boundaries retain their measured timestamps from the actual capture.
  measured('Start the finite local JSON stream.');
  const cues = [
    { seconds: 0, text: 'Preview of the completed interaction.' },
    { seconds: 2, text: 'Start a local JSON stream.' },
    {
      seconds: measured('Stop cancels'),
      text: 'Stop keeps a partial preview.',
    },
    { seconds: measured('Reset clears'), text: 'Reset clears the preview.' },
    { seconds: measured('Start a new stream'), text: 'Start again.' },
    {
      seconds: measured('An alert appears'),
      text: 'Fields resolve. Validate the finished document.',
    },
  ];
  measured('Source EOF, parser completion');
  const end = Math.floor(duration * 1000) / 1000;
  const stamp = (seconds: number) =>
    new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
  const blocks = cues.map((cue, index) => {
    const next = cues[index + 1]?.seconds ?? end;
    if (!Number.isFinite(next) || next > end || next - cue.seconds < 1)
      throw new Error(
        'Parser caption interval must be at least one second within the recording',
      );
    return `${stamp(cue.seconds)} --> ${stamp(next)}\n${cue.text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}
