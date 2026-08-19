import { observableToAsyncIterable } from './observable-to-async-iterable';
import { Observable, Subject } from 'rxjs';

test('subscribes immediately when the adapter is created', () => {
  const subscribe = jest.fn(() => ({ unsubscribe: jest.fn() }));

  observableToAsyncIterable({ subscribe });

  expect(subscribe).toHaveBeenCalledTimes(1);
});

test('buffers values emitted before next is called', async () => {
  const source = new Subject<number>();
  const iterator = observableToAsyncIterable(source);
  source.next(1);
  source.next(2);

  const first = await iterator.next();
  const second = await iterator.next();

  expect(first).toEqual({ done: false, value: 1 });
  expect(second).toEqual({ done: false, value: 2 });
});

test('resolves multiple pending next calls in order', async () => {
  const source = new Subject<number>();
  const iterator = observableToAsyncIterable(source);
  const firstPromise = iterator.next();
  const secondPromise = iterator.next();

  source.next(1);
  source.next(2);

  await expect(firstPromise).resolves.toEqual({ done: false, value: 1 });
  await expect(secondPromise).resolves.toEqual({ done: false, value: 2 });
});

test('buffers synchronous values before synchronous completion', async () => {
  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const iterator = observableToAsyncIterable(source);

  await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('close after synchronous completion discards buffered values', async () => {
  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();
  });
  const iterator = observableToAsyncIterable(source);

  iterator.close();

  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('return after synchronous completion discards buffered values', async () => {
  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();
  });
  const iterator = observableToAsyncIterable(source);

  const returnResult = await iterator.return?.('closed');

  expect(returnResult).toEqual({ done: true, value: 'closed' });
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('throw after synchronous completion discards buffered values and establishes its error', async () => {
  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.complete();
  });
  const iterator = observableToAsyncIterable(source);
  const iteratorError = new Error('iterator failed');

  const throwPromise = iterator.throw?.(iteratorError);

  await expect(throwPromise).rejects.toBe(iteratorError);
  await expect(iterator.next()).rejects.toBe(iteratorError);
});

test('close overrides a synchronous source error and discards buffered values', async () => {
  const source = new Observable<number>((observer) => {
    observer.next(1);
    observer.error(new Error('source failed'));
  });
  const iterator = observableToAsyncIterable(source);

  iterator.close();

  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test('rejects next calls after a synchronous source error', async () => {
  const sourceError = new Error('source failed');
  const source = new Observable<number>((observer) => {
    observer.error(sourceError);
  });

  const iterator = observableToAsyncIterable(source);

  await expect(iterator.next()).rejects.toBe(sourceError);
});

test('rejects all pending and future next calls with a terminal error', async () => {
  const source = new Subject<number>();
  const iterator = observableToAsyncIterable(source);
  const firstPromise = iterator.next();
  const secondPromise = iterator.next();
  const sourceError = new Error('source failed');

  source.error(sourceError);

  await expect(firstPromise).rejects.toBe(sourceError);
  await expect(secondPromise).rejects.toBe(sourceError);
  await expect(iterator.next()).rejects.toBe(sourceError);
});

test('return settles pending reads and closes the source exactly once', async () => {
  const unsubscribe = jest.fn();
  const onClose = jest.fn();
  const source = new Observable<number>(() => unsubscribe);
  const iterator = observableToAsyncIterable(source, (value) => value, onClose);
  const firstPromise = iterator.next();
  const secondPromise = iterator.next();

  const returnResult = await iterator.return?.('closed');
  iterator.close();

  expect(returnResult).toEqual({ done: true, value: 'closed' });
  await expect(firstPromise).resolves.toEqual({ done: true, value: undefined });
  await expect(secondPromise).resolves.toEqual({
    done: true,
    value: undefined,
  });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('throw rejects pending reads and closes the source exactly once', async () => {
  const unsubscribe = jest.fn();
  const onClose = jest.fn();
  const source = new Observable<number>(() => unsubscribe);
  const iterator = observableToAsyncIterable(source, (value) => value, onClose);
  const firstPromise = iterator.next();
  const secondPromise = iterator.next();
  const iteratorError = new Error('iterator failed');

  const throwPromise = iterator.throw?.(iteratorError);
  iterator.close();

  await expect(throwPromise).rejects.toBe(iteratorError);
  await expect(firstPromise).rejects.toBe(iteratorError);
  await expect(secondPromise).rejects.toBe(iteratorError);
  await expect(iterator.next()).rejects.toBe(iteratorError);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('close settles pending reads and cleans up exactly once', async () => {
  const unsubscribe = jest.fn();
  const onClose = jest.fn();
  const source = new Observable<number>(() => unsubscribe);
  const iterator = observableToAsyncIterable(source, (value) => value, onClose);
  const nextPromise = iterator.next();

  iterator.close();
  iterator.close();

  await expect(nextPromise).resolves.toEqual({ done: true, value: undefined });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('turns mapper exceptions into terminal iterator errors and cleans up', async () => {
  let observer:
    | {
        next(value: number): void;
        error(error: unknown): void;
        complete(): void;
      }
    | undefined;
  const unsubscribe = jest.fn();
  const onClose = jest.fn();
  const mapperError = new Error('mapping failed');
  const source = {
    subscribe(nextObserver: NonNullable<typeof observer>) {
      observer = nextObserver;
      return { unsubscribe };
    },
  };
  const iterator = observableToAsyncIterable(
    source,
    () => {
      throw mapperError;
    },
    onClose,
  );
  const nextPromise = iterator.next();

  expect(() => observer?.next(1)).not.toThrow();

  await expect(nextPromise).rejects.toBe(mapperError);
  await expect(iterator.next()).rejects.toBe(mapperError);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('source errors clean up the subscription and close callback', async () => {
  let observer:
    | {
        next(value: number): void;
        error(error: unknown): void;
        complete(): void;
      }
    | undefined;
  const unsubscribe = jest.fn();
  const onClose = jest.fn();
  const source = {
    subscribe(nextObserver: NonNullable<typeof observer>) {
      observer = nextObserver;
      return { unsubscribe };
    },
  };
  const iterator = observableToAsyncIterable(source, (value) => value, onClose);
  const sourceError = new Error('parser failed');

  observer?.error(sourceError);

  await expect(iterator.next()).rejects.toBe(sourceError);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('ignores emissions after the iterator reaches a terminal state', async () => {
  let observer:
    | {
        next(value: number): void;
        error(error: unknown): void;
        complete(): void;
      }
    | undefined;
  const map = jest.fn((value: number) => value);
  const source = {
    subscribe(nextObserver: NonNullable<typeof observer>) {
      observer = nextObserver;
      return { unsubscribe: jest.fn() };
    },
  };
  const iterator = observableToAsyncIterable(source, map);

  observer?.complete();
  observer?.next(1);

  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  expect(map).not.toHaveBeenCalled();
});
