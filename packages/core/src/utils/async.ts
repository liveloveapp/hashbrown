export async function sleep(timeout: number, abortSignal?: AbortSignal) {
  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, timeout);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    }
  });
}

export function switchAsync(
  fn: (abortSignal: AbortSignal) => Promise<void>,
  outerSignal?: AbortSignal,
) {
  let abortController: AbortController | undefined;

  if (outerSignal) {
    outerSignal.addEventListener('abort', () => {
      if (abortController) {
        abortController.abort();
      }
    });
  }

  return (): Promise<void> => {
    if (abortController) {
      abortController.abort();
    }

    const controller = new AbortController();
    abortController = controller;

    return fn(controller.signal).finally(() => {
      if (abortController === controller) {
        abortController = undefined;
      }
    });
  };
}
