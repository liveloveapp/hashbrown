import type {
  Interrupt,
  PendingInterruptBatch,
  ResumeEntry,
  ResumeOptions,
} from '../models/interrupt';
import { cloneAndFreezeOptionalJsonValue } from '../utils/json-value';

/**
 * Validates and owns terminal interrupts, returning undefined for ordinary success.
 *
 * @internal
 */
export function validateInterruptOutcome(
  value: unknown,
): readonly Interrupt[] | undefined {
  if (value === undefined) return undefined;
  try {
    if (!isRecord(value)) throw new TypeError();
    if (value['type'] === 'success') return undefined;
    const interrupts = value['interrupts'];
    if (
      value['type'] !== 'interrupt' ||
      !Array.isArray(interrupts) ||
      interrupts.length === 0
    )
      throw new TypeError();
    const ids = new Set<string>();
    return Object.freeze(
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
    );
  } catch {
    throw new TypeError('Invalid interrupt outcome.');
  }
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
