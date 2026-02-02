import { VAD, VADEnvironmentError } from './vox';

const createTestModule = () => ({
  _main: jest.fn(),
  cwrap: jest.fn(() => jest.fn()),
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

test('start only calls connectMicrophone once while a connection is in flight', async () => {
  const sharedArrayDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedArrayBuffer',
  );
  const crossOriginDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'crossOriginIsolated',
  );

  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    value:
      globalThis.SharedArrayBuffer ??
      function SharedArrayBufferMock() {
        return {};
      },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    configurable: true,
  });

  try {
    const module = createTestModule() as unknown as {
      _main: () => number;
      cwrap: (...args: unknown[]) => unknown;
      ready: Promise<unknown>;
    };
    type ModuleReturn = ReturnType<Parameters<VAD['initialize']>[0]>;

    const AudioContextMock = class {
      resume = jest.fn();
      destination = {};
    };

    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext =
      AudioContextMock as unknown as typeof AudioContext;
    (globalThis as { AudioWorklet?: typeof AudioWorklet }).AudioWorklet =
      function AudioWorkletMock() {
        return {} as AudioWorklet;
      } as unknown as typeof AudioWorklet;
    AudioWorklet.prototype.addModule = jest.fn(() => Promise.resolve());
    (
      globalThis as { AudioWorkletNode?: typeof AudioWorkletNode }
    ).AudioWorkletNode =
      class AudioWorkletNodeMock {} as unknown as typeof AudioWorkletNode;

    const vad = new VAD({ pollInterval: 5 });
    await vad.initialize(() => module as ModuleReturn);

    const win = window as Window & {
      audioWorkletReady?: boolean;
      audioWorkletNativeContext?: AudioContext;
    };
    win.audioWorkletReady = true;
    win.audioWorkletNativeContext =
      new AudioContextMock() as unknown as AudioContext;

    const connectDeferred: { resolve?: () => void } = {};
    const connectPromise = new Promise<void>((resolve) => {
      connectDeferred.resolve = resolve;
    });
    const connectSpy = jest.fn(() => connectPromise);
    (
      vad as unknown as { connectMicrophone: () => Promise<void> }
    ).connectMicrophone = connectSpy;

    jest.useFakeTimers();

    const startPromise = vad.start();
    jest.advanceTimersByTime(5);
    jest.advanceTimersByTime(5);

    expect(connectSpy).toHaveBeenCalledTimes(1);

    connectDeferred.resolve?.();
    await startPromise;
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

    jest.useRealTimers();
  }
});

test('stop releases media stream tracks', () => {
  const vad = new VAD();
  const trackStop = jest.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] };

  (
    vad as unknown as { microphoneStream: MediaStream | null }
  ).microphoneStream = stream as unknown as MediaStream;
  (vad as unknown as { isRunning: boolean }).isRunning = true;
  (vad as unknown as { audioContext: AudioContext | null }).audioContext = {
    close: jest.fn(),
  } as unknown as AudioContext;
  (
    vad as unknown as { microphoneSource: MediaStreamAudioSourceNode | null }
  ).microphoneSource = {
    disconnect: jest.fn(),
  } as unknown as MediaStreamAudioSourceNode;
  (vad as unknown as { workletNode: AudioWorkletNode | null }).workletNode = {
    disconnect: jest.fn(),
  } as unknown as AudioWorkletNode;

  vad.stop();

  expect(trackStop).toHaveBeenCalledTimes(1);
});
