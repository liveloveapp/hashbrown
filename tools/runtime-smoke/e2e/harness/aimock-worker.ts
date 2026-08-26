import type { AimockHandle } from '@hashbrownai/testing/aimock';

/** Runs one worker body with an owned aimock handle and deterministic cleanup. */
export async function runAimockWorker(
  start: () => Promise<AimockHandle>,
  use: (handle: AimockHandle) => Promise<void>,
): Promise<void> {
  const handle = await start();
  let stopPromise: Promise<void> | undefined;
  const wrappedHandle: AimockHandle = {
    ...handle,
    stop() {
      stopPromise ??= Promise.resolve().then(() => handle.stop());
      return stopPromise;
    },
  };
  let bodyFailed = false;
  let bodyError: unknown;

  try {
    await use(wrappedHandle);
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }

  try {
    await wrappedHandle.stop();
  } catch (error) {
    if (!bodyFailed) {
      throw error;
    }
  }

  if (bodyFailed) {
    throw bodyError;
  }
}
