/** Neutral terminal tool metadata, independent of any producer framework. */
export interface ToolOutcome {
  readonly v: 1;
  readonly outcome:
    'success' | 'failure' | 'denied' | 'cancelled' | 'interrupted' | 'retried';
  readonly error?: { readonly message: string };
}

type Metadata = Readonly<Record<string, unknown>>;
const key = 'hashbrown.tool';
const outcomes: readonly string[] = [
  'success',
  'failure',
  'denied',
  'cancelled',
  'interrupted',
  'retried',
];

/** Read only valid, known neutral outcomes; unknown metadata stays opaque. */
export function readToolOutcome(
  metadata: Metadata | undefined,
): ToolOutcome | undefined {
  const value = metadata?.[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const raw = value as Record<string, unknown>;
  if (raw['v'] !== 1 || !outcomes.includes(raw['outcome'] as string))
    return undefined;
  const error = raw['error'];
  let message: string | undefined;
  if (error !== undefined) {
    if (typeof error !== 'object' || error === null || Array.isArray(error))
      return undefined;
    const detail = (error as Record<string, unknown>)['message'];
    if (typeof detail !== 'string' || detail.trim().length === 0)
      return undefined;
    message = detail;
  }
  if (raw['outcome'] !== 'failure')
    return { v: 1, outcome: raw['outcome'] as ToolOutcome['outcome'] };
  return message !== undefined
    ? { v: 1, outcome: 'failure', error: { message } }
    : undefined;
}

/** Merge outcome metadata immutably, preserving explicit bad terminal settlements. */
export function mergeToolOutcomeMetadata(
  previous: Metadata | undefined,
  incoming: Metadata | undefined,
): Record<string, unknown> | undefined {
  if (incoming === undefined)
    return previous as Record<string, unknown> | undefined;
  const first = readToolOutcome(previous);
  const second = readToolOutcome(incoming);
  const settled =
    first?.outcome === 'failure' ||
    ((first?.outcome === 'denied' || first?.outcome === 'cancelled') &&
      second?.outcome !== 'failure');
  const preserved = first && (!second || settled) ? first : second;
  return {
    ...previous,
    ...incoming,
    ...(preserved ? { [key]: preserved } : {}),
  };
}
