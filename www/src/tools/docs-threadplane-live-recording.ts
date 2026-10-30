import type { WorkbenchRecordingCue } from './workbench-recording-cues';

/** Requires an explicit real provider before creating any recording host. */
export function threadplaneLiveSettings(
  env: Readonly<Record<string, string | undefined>>,
) {
  if (env['DOCS_THREADPLANE_FIXTURE'])
    throw new Error('A fixture cannot supply published live footage.');
  if (!env['OPENAI_API_KEY'])
    throw new Error(
      'Live Threadplane recording requires server-only OPENAI_API_KEY.',
    );
  if (!env['OPENAI_MODEL'])
    throw new Error(
      'Live Threadplane recording requires explicit OPENAI_MODEL.',
    );
  return {
    apiKey: env['OPENAI_API_KEY'],
    model: env['OPENAI_MODEL'],
    record: env['DOCS_SKIP_RECORDING'] !== '1',
  };
}

/** Produces readable actual-speed captions from measured successful interaction phases. */
export function threadplaneLiveRecordingCues(
  phases: Readonly<Record<string, number>>,
  duration: number,
): readonly WorkbenchRecordingCue[] {
  const steps = [
    ['firstComplete', 'Threadplane shows the real streaming reply.'],
    ['followup', 'First turn retained in local history.'],
    ['secondComplete', 'A follow-up shortens the second step.'],
    ['inspected', 'Inspect actual requests and protocol JSON.'],
    ['replay', 'The application plan remains unchanged.'],
    ['returnedLive', 'Replay uses captured text. No requests.'],
  ];
  let previous = 0;
  const cues: WorkbenchRecordingCue[] = steps.map(([name, caption]) => {
    const from = previous,
      to = phases[name];
    if (
      !Number.isFinite(to) ||
      to <= from ||
      to >= duration ||
      caption.length / (to - from) > 20
    )
      throw new Error(`Unreadable or missing recording phase: ${name}`);
    previous = to;
    return [from, to, caption];
  });
  const endCaption = 'Back live. State is unchanged.';
  if (
    !Number.isFinite(duration) ||
    duration <= previous ||
    endCaption.length / (duration - previous) > 20
  )
    throw new Error('Unreadable final caption.');
  return [...cues, [previous, duration, endCaption]];
}

/** Requires multiple genuine growing content deltas in one recorded source turn. */
export function threadplaneIncrementalEvidence(
  frames: readonly {
    readonly turn: number;
    readonly kind: string;
    readonly payload: unknown;
    readonly json: string;
  }[],
  turn: number,
) {
  const content = frames.filter(
    (frame) =>
      frame.turn === turn &&
      frame.kind === 'event' &&
      typeof frame.payload === 'object' &&
      frame.payload !== null &&
      'type' in frame.payload &&
      frame.payload.type === 'TEXT_MESSAGE_CONTENT',
  );
  let previous = '';
  for (const frame of content) {
    const delta = (frame.payload as { delta?: unknown }).delta;
    if (typeof delta !== 'string' || !delta || frame.json !== previous + delta)
      throw new Error(`Invalid incremental content in turn ${turn}.`);
    previous = frame.json;
  }
  if (content.length < 2)
    throw new Error(`Missing incremental content in turn ${turn}.`);
  return { turn, deltas: content.length, finalLength: previous.length };
}
