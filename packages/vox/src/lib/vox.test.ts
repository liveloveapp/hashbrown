import { VAD, VADEnvironmentError } from './vox';

const createTestModule = () => ({
  _main: jest.fn(),
  cwrap: jest.fn(),
  ready: Promise.resolve({}),
});

test('initialize throws a VADEnvironmentError when cross-origin isolation is missing', async () => {
  const module = createTestModule() as unknown as {
    _main: () => number;
    cwrap: (...args: unknown[]) => unknown;
    ready: Promise<unknown>;
  };
  type ModuleReturn = ReturnType<Parameters<VAD['initialize']>[0]>;
  const vad = new VAD();

  const sharedArrayDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedArrayBuffer',
  );
  const crossOriginDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'crossOriginIsolated',
  );

  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: false,
    configurable: true,
  });

  let error: unknown;

  try {
    await vad.initialize(() => module as ModuleReturn);
  } catch (err) {
    error = err;
  } finally {
    if (sharedArrayDescriptor) {
      Object.defineProperty(
        globalThis,
        'SharedArrayBuffer',
        sharedArrayDescriptor,
      );
    } else {
      delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
    }

    if (crossOriginDescriptor) {
      Object.defineProperty(
        globalThis,
        'crossOriginIsolated',
        crossOriginDescriptor,
      );
    } else {
      delete (globalThis as { crossOriginIsolated?: unknown })
        .crossOriginIsolated;
    }
  }

  expect(error).toBeInstanceOf(VADEnvironmentError);
  expect((error as Error).message).toContain('Cross-Origin-Opener-Policy');
});

test('initialize throws a VADEnvironmentError when module loader hits SharedArrayBuffer', async () => {
  const vad = new VAD();

  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    configurable: true,
  });

  const sharedArrayDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedArrayBuffer',
  );

  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    value: undefined,
    configurable: true,
  });

  let error: unknown;

  try {
    await vad.initialize(() => {
      throw new ReferenceError('SharedArrayBuffer is not defined');
    });
  } catch (err) {
    error = err;
  } finally {
    if (sharedArrayDescriptor) {
      Object.defineProperty(
        globalThis,
        'SharedArrayBuffer',
        sharedArrayDescriptor,
      );
    } else {
      delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
    }
  }

  expect(error).toBeInstanceOf(VADEnvironmentError);
  expect((error as Error).message).toContain('Cross-Origin-Embedder-Policy');
});
