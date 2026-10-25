import { s } from '@hashbrownai/core';

/** The weather fields resolved by both framework examples. */
export const weatherSchema = s.object('Weather summary', {
  city: s.string('City name'),
  forecast: s.streaming.string('Forecast text'),
  alerts: s.streaming.array(
    'Weather alerts',
    s.object('Alert', {
      title: s.string('Alert title'),
      severity: s.enumeration('Severity', ['low', 'medium', 'high']),
    }),
  ),
});

/** The finite source lifecycle, independent of JSON parser completion. */
export type ParserSourceState = 'idle' | 'streaming' | 'ended' | 'stopped';

/** Deterministic inputs for inspecting partial values and recovery. */
export const parserExamples: Record<
  | 'valid'
  | 'malformed'
  | 'schema-invalid'
  | 'truncated'
  | 'missing-streaming-field'
  | 'wrong-type',
  readonly string[]
> = {
  valid: [
    '{"city":"Port',
    'land","forecast":"',
    'Clouds',
    ' clearing by noon.","alerts":[',
    '{"title":"Wet roads","severity":"lo',
    'w"',
    '},',
    '{"title":"Gusty wind","severity":"medium"',
    '}',
    ']}',
  ],
  malformed: ['{"city":"Portland","forecast":"Clouds","alerts":[]}', '!'],
  'schema-invalid': [
    '{"city":"Portland","forecast":"Clouds","alerts":[',
    '{"title":"Wind","severity":"extreme"}]}',
  ],
  truncated: ['{"city":"Portland","forecast":"Clouds', ' clearing'],
  'missing-streaming-field': ['{"city":"Portland","alerts":[]}'],
  'wrong-type': ['{"city":"Portland","forecast":12,"alerts":[]}'],
};

/** Classifies source ownership separately from parser completion. */
export function parserDemoState(input: {
  source: ParserSourceState;
  error: unknown;
  isComplete: boolean;
  json: string;
}): {
  status: string;
  busy: boolean;
  isComplete: boolean;
  showPreview: boolean;
} {
  let invalid = Boolean(input.error);
  if (input.source === 'ended' && input.isComplete && !invalid) {
    try {
      weatherSchema.validate(JSON.parse(input.json));
    } catch {
      invalid = true;
    }
  }
  const complete = input.source === 'ended' && input.isComplete && !invalid;
  const status = invalid
    ? 'Invalid JSON or schema'
    : input.source === 'idle'
      ? 'Idle'
      : input.source === 'stopped'
        ? 'Stopped'
        : input.source === 'streaming'
          ? 'Streaming preview'
          : complete
            ? 'Complete valid document'
            : 'Incomplete document';
  return {
    status,
    busy: input.source === 'streaming',
    isComplete: complete,
    showPreview: input.source !== 'idle' && !invalid,
  };
}

/** Starts a finite local source and returns an idempotent cancellation function. */
export function startLocalJsonStream(
  chunks: readonly string[],
  onChunk: (chunk: string) => void,
  onEnd: () => void,
): () => void {
  let index = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    if (index < chunks.length) onChunk(chunks[index++]);
    if (cancelled) return;
    if (index === chunks.length) onEnd();
    else timer = setTimeout(tick, 350);
  };
  let timer = setTimeout(tick, 350);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
