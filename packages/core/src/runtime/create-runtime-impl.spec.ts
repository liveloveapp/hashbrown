import { Worker } from 'node:worker_threads';

/** Runs real QuickJS in a worker so a broken interrupt cannot hang Jest. */
async function runIsolatedRuntimeTest(operation: string): Promise<unknown> {
  const worker = new Worker(
    `
      require('tsx/cjs');
      // The runtime intentionally uses the browser-only, embedded-WASM variant.
      globalThis.window = {};
      const { parentPort, workerData } = require('node:worker_threads');
      const { createRuntimeImpl } = require(workerData.sourcePath);

      (async () => {
        await import('quickjs-emscripten-core');
        await import('@jitl/quickjs-singlefile-browser-debug-asyncify');
        Object.defineProperty(process.versions, 'node', { value: undefined });
        // Load and initialize WASM before starting the regression's deadline.
        const warmup = createRuntimeImpl({ functions: [], timeout: 10000 });
        const result = await warmup.run('40 + 2');
        if (result.result !== 42) throw new Error('QuickJS warmup failed');
        parentPort.postMessage({ ready: true });
        parentPort.once('message', async () => {
          const result = await (async () => { ${operation} })();
          parentPort.postMessage({ result });
        });
      })();
    `,
    {
      eval: true,
      workerData: { sourcePath: require.resolve('./create-runtime-impl') },
    },
  );
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  try {
    return await new Promise((resolve, reject) => {
      watchdog = setTimeout(
        () => reject(new Error('QuickJS worker did not initialize')),
        10000,
      );
      worker.on('error', reject);
      worker.on('message', (message) => {
        if (message.ready) {
          clearTimeout(watchdog);
          watchdog = setTimeout(
            () => reject(new Error('QuickJS evaluation exceeded 5 seconds')),
            5000,
          );
          worker.postMessage('run');
        } else {
          resolve(message.result);
        }
      });
    });
  } finally {
    clearTimeout(watchdog);
    await worker.terminate();
  }
}

test('interrupts a synchronous infinite loop at the runtime deadline and can run again', async () => {
  const operation = `
    const runtime = createRuntimeImpl({ functions: [], timeout: 1000 });
    const interrupted = await runtime.run('while (true) {}');
    const recovered = await runtime.run('40 + 2');
    return { interrupted, recovered };
  `;

  const result = await runIsolatedRuntimeTest(operation);

  expect(result).toEqual({
    interrupted: {
      error: expect.objectContaining({
        name: 'InternalError',
        message: 'interrupted',
      }),
    },
    recovered: { result: 42 },
  });
}, 20000);

test('interrupts synchronous code when the caller signal is already aborted', async () => {
  const operation = `
    const runtime = createRuntimeImpl({ functions: [], timeout: 10000 });
    return runtime.run('while (true) {}', AbortSignal.abort());
  `;

  const result = await runIsolatedRuntimeTest(operation);

  expect(result).toEqual({
    error: expect.objectContaining({
      name: 'InternalError',
      message: 'interrupted',
    }),
  });
}, 20000);
