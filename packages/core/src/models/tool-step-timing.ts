/**
 * The minimum elapsed time before a tool step is eligible for display.
 *
 * @public
 */
export const NO_FLASH_MS = 300;

/**
 * The suggested cadence in milliseconds for refreshing elapsed duration text.
 *
 * @public
 */
export const ELAPSED_TICK_MS = 1000;

/**
 * Formats a known nonnegative duration using whole seconds and minutes.
 * Durations below one second are shown as `<1s`; missing, nonfinite, and
 * negative durations remain unknown.
 *
 * @param milliseconds - The elapsed duration in milliseconds.
 * @returns The duration text, or undefined when the duration is unknown.
 * @public
 */
export function formatDuration(
  milliseconds: number | undefined,
): string | undefined {
  if (
    milliseconds === undefined ||
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  )
    return undefined;

  const seconds = Math.floor(milliseconds / 1000);
  if (seconds === 0) return '<1s';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Computes the remaining no-flash delay without changing or discarding a step.
 * Both timestamps must come from the same clock. Missing or nonfinite values
 * and a clock earlier than the start produce an unknown delay. Finite negative
 * timestamps are valid when their elapsed time is nonnegative.
 * Callers own clock readings, scheduling, and whether to display a step.
 *
 * @param startedAt - The start timestamp in milliseconds.
 * @param now - The current timestamp from the same clock, in milliseconds.
 * @returns Remaining milliseconds, or undefined for unknown elapsed time.
 * @public
 */
export function noFlashRemaining(
  startedAt: number | undefined,
  now: number,
): number | undefined {
  if (
    startedAt === undefined ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(now) ||
    now < startedAt
  )
    return undefined;

  return Math.max(0, NO_FLASH_MS - (now - startedAt));
}
