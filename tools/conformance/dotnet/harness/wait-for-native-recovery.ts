import { setTimeout as delay } from 'node:timers/promises';

/**
 * Waits for request cleanup after the response ends. Only the transient Busy
 * state is polled; errors and other dispositions remain visible to the caller.
 */
export async function waitForNativeRecovery<
  T extends { readonly disposition: string },
>(read: () => Promise<T>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await read();
    if (state.disposition !== 'Busy') return state;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error('Native recovery remained Busy after request cleanup');
    await delay(Math.min(20, remaining));
  }
}
