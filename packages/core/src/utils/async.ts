export async function sleep(timeout: number, abortSignal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }

    const settle = () => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', settle);
      resolve();
    };
    const timeoutId = setTimeout(settle, timeout);
    abortSignal?.addEventListener('abort', settle, { once: true });
  });
}
