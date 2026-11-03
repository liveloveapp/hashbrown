import type {
  Interrupt,
  PendingInterruptBatch,
  ResumeEntry,
  ResumeOptions,
} from '../models/interrupt';
import { cloneAndFreezeOptionalJsonValue } from '../utils/json-value';

/**
 * A validated AG-UI 1.0 `RUN_FINISHED.outcome`: success, interrupt, or cancelled.
 *
 * @internal
 */
export type ValidatedRunFinishedOutcome =
  | { readonly type: 'success' }
  | {
      readonly type: 'interrupt';
      readonly interrupts: readonly Interrupt[];
      /** Kept-open call observations; these identifiers grant no approval authority. */
      readonly pendingToolCallIds?: readonly string[];
    }
  | { readonly type: 'cancelled' };

/**
 * Validates a `RUN_FINISHED.outcome` and owns its interrupts and kept-open calls.
 *
 * An absent outcome is success, as AG-UI 1.0 defines it. A cancelled outcome
 * carries nothing else: the run stopped without failing, so there is neither
 * a result to keep nor an interrupt to answer.
 *
 * @internal
 */
export function validateRunFinishedOutcome(
  value: unknown,
): ValidatedRunFinishedOutcome {
  if (value === undefined) return SUCCESS;
  try {
    if (!isRecord(value)) throw new TypeError();
    if (value['type'] === 'success') return SUCCESS;
    if (value['type'] === 'cancelled') return CANCELLED;
    const interrupts = value['interrupts'];
    if (
      value['type'] !== 'interrupt' ||
      !Array.isArray(interrupts) ||
      interrupts.length === 0
    )
      throw new TypeError();
    const ids = new Set<string>();
    const pending = value['pendingToolCallIds'];
    const pendingToolCallIds =
      pending === undefined ? undefined : ownPendingToolCallIds(pending);
    return Object.freeze({
      type: 'interrupt',
      ...(pendingToolCallIds === undefined ? {} : { pendingToolCallIds }),
      interrupts: Object.freeze(
        Array.from(interrupts, (item): Interrupt => {
          if (
            !isRecord(item) ||
            typeof item['id'] !== 'string' ||
            typeof item['reason'] !== 'string' ||
            ids.has(item['id'])
          )
            throw new TypeError();
          ids.add(item['id']);
          const optional: Record<string, unknown> = {};
          for (const key of [
            'message',
            'toolCallId',
            'subagentRunId',
            'expiresAt',
          ]) {
            const field = item[key];
            if (field === undefined) continue;
            if (typeof field !== 'string') throw new TypeError();
            if (key === 'expiresAt') parseExpiry(field);
            optional[key] = field;
          }
          for (const key of ['responseSchema', 'metadata']) {
            const field = item[key];
            if (field === undefined) continue;
            if (!isRecord(field)) throw new TypeError();
            optional[key] = cloneAndFreezeOptionalJsonValue(field);
          }
          return Object.freeze({
            id: item['id'],
            reason: item['reason'],
            ...optional,
          });
        }),
      ),
    });
  } catch {
    throw new TypeError('Invalid run outcome.');
  }
}

/** Owns dense, unique call observations without interpreting them as permissions. */
function ownPendingToolCallIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError();
  const ids = new Set<string>();
  const owned: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !item ||
      !('value' in item) ||
      typeof item.value !== 'string' ||
      item.value.trim().length === 0 ||
      ids.has(item.value)
    )
      throw new TypeError();
    ids.add(item.value);
    owned.push(item.value);
  }
  return Object.freeze(owned);
}

const SUCCESS: ValidatedRunFinishedOutcome = Object.freeze({
  type: 'success',
});
const CANCELLED: ValidatedRunFinishedOutcome = Object.freeze({
  type: 'cancelled',
});

/**
 * Validates and owns terminal interrupts, returning undefined for ordinary success.
 *
 * Only runs that completed may reach here: a cancelled outcome is settled by
 * the run driver before any terminal event is forwarded, so reading one as
 * interrupt-free success would be a bug, and it throws.
 *
 * @internal
 */
export function validateInterruptOutcome(
  value: unknown,
): readonly Interrupt[] | undefined {
  const outcome = validateRunFinishedOutcome(value);
  if (outcome.type === 'cancelled') {
    throw new TypeError('A cancelled run has no interrupts to publish.');
  }
  return outcome.type === 'interrupt' ? outcome.interrupts : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseExpiry(value: string): number {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) throw new TypeError();
  const [, year, month, day, hour, minute, second, zone] = match;
  const numericYear = Number(year);
  const leapYear =
    numericYear % 4 === 0 &&
    (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    Number(month) - 1
  ];
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (zone !== 'Z' &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    throw new TypeError();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError();
  return timestamp;
}

/**
 * Validates a complete local submission and owns its JSON values before claiming.
 *
 * @internal
 */
export function validateResumeOptions(
  batch: PendingInterruptBatch,
  options: unknown,
  now: number,
): ResumeOptions {
  if (!isRecord(options) || options['batchId'] !== batch.id) {
    throw new TypeError('Stale interrupt batch.');
  }
  assertInterruptsNotExpired(batch.interrupts, now);
  try {
    const entries = options['entries'];
    if (!Array.isArray(entries) || entries.length !== batch.interrupts.length)
      throw new TypeError();
    const remaining = new Set(
      batch.interrupts.map((interrupt) => interrupt.id),
    );
    const owned = entries.map((entry): ResumeEntry => {
      if (
        !isRecord(entry) ||
        typeof entry['interruptId'] !== 'string' ||
        !remaining.delete(entry['interruptId']) ||
        (entry['status'] !== 'resolved' && entry['status'] !== 'cancelled')
      )
        throw new TypeError();
      const payload = entry['payload'];
      const metadata = entry['metadata'];
      if (entry['status'] === 'cancelled' && payload !== undefined)
        throw new TypeError();
      if (metadata !== undefined && !isRecord(metadata)) throw new TypeError();
      return Object.freeze({
        interruptId: entry['interruptId'],
        status: entry['status'],
        ...(payload !== undefined
          ? { payload: cloneAndFreezeOptionalJsonValue(payload) }
          : {}),
        ...(metadata !== undefined
          ? {
              metadata: cloneAndFreezeOptionalJsonValue(metadata) as Readonly<
                Record<string, unknown>
              >,
            }
          : {}),
      });
    });
    if (remaining.size !== 0) throw new TypeError();
    return Object.freeze({ batchId: batch.id, entries: Object.freeze(owned) });
  } catch {
    throw new TypeError('Invalid resume responses.');
  }
}

/**
 * Rechecks validated, owned interrupts against an injected clock before a claim or send.
 *
 * @internal
 */
export function assertInterruptsNotExpired(
  interrupts: readonly Interrupt[],
  now: number,
): void {
  if (
    interrupts.some(
      (interrupt) =>
        interrupt.expiresAt !== undefined &&
        now >= parseExpiry(interrupt.expiresAt),
    )
  ) {
    throw new Error('Interrupt batch expired; start a new thread to continue.');
  }
}
