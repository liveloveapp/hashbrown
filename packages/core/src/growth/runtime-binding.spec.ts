import { createHttpTransport } from '../transport';
import {
  bindRuntime,
  classifyTransport,
  registerRuntimeBinder,
  type RuntimeGrowthObserver,
} from './runtime-binding';

function createObserver(): RuntimeGrowthObserver {
  return {
    sessionStarted: jest.fn(),
    streamCompleted: jest.fn(),
    toolExecuted: jest.fn(),
  };
}

test('classifyTransport maps known transports and defaults', () => {
  const failingSend = async () => {
    throw new Error('unused');
  };

  const kinds = [
    classifyTransport(undefined),
    classifyTransport(createHttpTransport({})),
    classifyTransport({
      name: 'ExperimentalChromeLocalTransport',
      send: failingSend,
    }),
    classifyTransport({
      name: 'ExperimentalEdgeLocalTransport',
      send: failingSend,
    }),
    classifyTransport({
      name: 'DelegatingLocalPromptTransport',
      send: failingSend,
    }),
    classifyTransport({ name: 'Mine', send: failingSend }),
    classifyTransport(() => {
      throw new Error('boom');
    }),
  ];

  expect(kinds).toEqual([
    'http',
    'http',
    'local',
    'local',
    'delegating',
    'custom',
    'custom',
  ]);
});

test('bindRuntime returns undefined for an unknown key', () => {
  const observer = createObserver();

  const detach = bindRuntime({}, observer);

  expect(detach).toBeUndefined();
  expect(observer.sessionStarted).not.toHaveBeenCalled();
});

test('bindRuntime runs the registered binder and returns its detach', () => {
  const key = {};
  const detachBinder = jest.fn();
  const binder = jest.fn(() => detachBinder);
  const observer = createObserver();
  registerRuntimeBinder(key, binder);

  const detach = bindRuntime(key, observer);
  detach?.();

  expect(binder).toHaveBeenCalledWith(observer);
  expect(detachBinder).toHaveBeenCalledTimes(1);
});
