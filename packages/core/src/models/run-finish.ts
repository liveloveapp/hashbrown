import {
  type TokenUsage as AgUiTokenUsage,
  EventType,
  type RunFinishedEvent,
} from '@ag-ui/core';
import type { JsonValue } from '../utils/types';

/**
 * Why the model stopped generating in a run, the same set for every provider.
 *
 * - `stop`: the model finished its answer (or hit a stop sequence).
 * - `length`: the answer was cut off by an output token limit or the context
 *   window.
 * - `tool_calls`: the model stopped to call tools.
 * - `content_filter`: a provider safety filter or guardrail blocked or cut the
 *   answer, or blocked the prompt.
 * - `refusal`: the model declined to answer.
 * - `other`: any other reason; the provider's own reason is kept in the
 *   `RUN_FINISHED` metadata under the provider's key.
 *
 * @public
 */
export type FinishReason =
  'stop' | 'length' | 'tool_calls' | 'content_filter' | 'refusal' | 'other';

/**
 * Token counts for one provider and model, as AG-UI's `RUN_FINISHED.usage`
 * carries them. `inputTokens` and `outputTokens` are totals;
 * `cachedInputTokens`, `cacheWriteInputTokens` and `reasoningTokens` are parts
 * of them, never additions; `totalTokens` is the two totals summed.
 *
 * @public
 */
export type TokenUsage = AgUiTokenUsage;

const FINISH_REASONS: ReadonlySet<string> = new Set<FinishReason>([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
  'refusal',
  'other',
]);

const USAGE_COUNTS = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'reasoningTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
] as const;

type UsageCount = (typeof USAGE_COUNTS)[number];

/**
 * Token counts as a provider reports them, before absent or invalid values are
 * dropped.
 *
 * @internal
 */
export type ɵTokenUsageInput = {
  readonly provider?: string;
  readonly model?: string;
} & { readonly [K in UsageCount]?: number | null };

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Builds an AG-UI token usage entry, dropping absent or invalid counts and
 * computing `totalTokens` from the input and output totals when both are
 * known and no total was given.
 *
 * @param input - Counts already in AG-UI's accounting.
 * @returns The entry, or `undefined` when the provider reported no counts.
 *
 * @internal
 */
export function ɵcreateTokenUsage(
  input: ɵTokenUsageInput,
): TokenUsage | undefined {
  const usage: TokenUsage = {};
  if (input.provider !== undefined) usage.provider = input.provider;
  if (input.model !== undefined) usage.model = input.model;

  let hasCount = false;
  for (const key of USAGE_COUNTS) {
    const value = input[key];
    if (isCount(value)) {
      usage[key] = value;
      hasCount = true;
    }
  }
  if (!hasCount) return undefined;

  if (
    usage.totalTokens === undefined &&
    usage.inputTokens !== undefined &&
    usage.outputTokens !== undefined
  ) {
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
  }
  return usage;
}

/**
 * Inputs for a provider's closing `RUN_FINISHED`.
 *
 * @internal
 */
export interface ɵRunFinishedEventOptions {
  readonly threadId: string;
  readonly runId: string;
  /** The normalized reason, kept under `metadata.hashbrown.finishReason`. */
  readonly finishReason: FinishReason;
  /** The provider's metadata key, such as `anthropic`. */
  readonly provider: string;
  /** The provider's own reason fields, kept under `metadata[provider]`. */
  readonly providerMetadata?: Readonly<Record<string, JsonValue>>;
  readonly usage?: TokenUsage;
}

/**
 * What a provider's stream mapper reports about how the model stopped, for
 * `ɵcreateRunFinishedEvent`.
 *
 * @internal
 */
export type ɵRunFinish = Pick<
  ɵRunFinishedEventOptions,
  'finishReason' | 'providerMetadata' | 'usage'
>;

/**
 * Builds the `RUN_FINISHED` a provider ends a successful run with: the token
 * usage in AG-UI's standard `usage` field, the normalized finish reason under
 * `metadata.hashbrown`, and the provider's raw reason under its own metadata
 * key.
 *
 * @param options - Run identity, finish reason and usage.
 * @returns The terminal AG-UI event.
 *
 * @internal
 */
export function ɵcreateRunFinishedEvent(
  options: ɵRunFinishedEventOptions,
): RunFinishedEvent {
  const providerMetadata =
    options.providerMetadata && Object.keys(options.providerMetadata).length
      ? { [options.provider]: options.providerMetadata }
      : {};
  return {
    type: EventType.RUN_FINISHED,
    threadId: options.threadId,
    runId: options.runId,
    ...(options.usage ? { usage: [options.usage] } : {}),
    metadata: {
      hashbrown: { finishReason: options.finishReason },
      ...providerMetadata,
    },
  };
}

/**
 * Reads the normalized finish reason from a `RUN_FINISHED`. A reason outside
 * {@link FinishReason} reads as `other`.
 *
 * @param event - The terminal event.
 * @returns The reason, or `undefined` when the producer attached none.
 *
 * @internal
 */
export function ɵreadFinishReason(event: {
  readonly metadata?: unknown;
}): FinishReason | undefined {
  const hashbrown = isRecord(event.metadata)
    ? event.metadata['hashbrown']
    : undefined;
  const reason = isRecord(hashbrown) ? hashbrown['finishReason'] : undefined;
  if (typeof reason !== 'string') return undefined;
  return FINISH_REASONS.has(reason) ? (reason as FinishReason) : 'other';
}

/**
 * Reads and freezes the token usage of a `RUN_FINISHED`, keeping only the
 * well-formed fields of each entry.
 *
 * @param event - The terminal event.
 * @returns The entries, or `undefined` when the producer reported none.
 *
 * @internal
 */
export function ɵreadTokenUsage(event: {
  readonly usage?: unknown;
}): readonly TokenUsage[] | undefined {
  if (!Array.isArray(event.usage)) return undefined;
  const entries: TokenUsage[] = [];
  for (const entry of event.usage) {
    if (!isRecord(entry)) continue;
    const usage: TokenUsage = {};
    for (const key of ['provider', 'model'] as const) {
      if (typeof entry[key] === 'string') usage[key] = entry[key];
    }
    for (const key of USAGE_COUNTS) {
      if (isCount(entry[key])) usage[key] = entry[key];
    }
    entries.push(Object.freeze(usage));
  }
  return entries.length ? Object.freeze(entries) : undefined;
}
