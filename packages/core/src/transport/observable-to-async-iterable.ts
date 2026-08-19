interface Subscription {
  unsubscribe(): void;
}

interface Observer<T> {
  next(value: T): void;
  error(error: unknown): void;
  complete(): void;
}

interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;
}

/**
 * Async iterator with an explicit synchronous close operation.
 *
 * @internal
 */
export interface ClosableAsyncIterableIterator<
  T,
> extends AsyncIterableIterator<T> {
  close(): void;
}

/**
 * Adapts the minimal observable contract to an eagerly subscribed async iterator.
 *
 * @internal
 */
export function observableToAsyncIterable<T, U = T>(
  source: Subscribable<T>,
  map: (value: T) => U = (value) => value as unknown as U,
  onClose?: () => void,
): ClosableAsyncIterableIterator<U> {
  const bufferedValues: U[] = [];
  const pendingNextCalls: Array<{
    resolve: (result: IteratorResult<U>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let terminalState:
    | 'active'
    | 'source-completed'
    | 'source-errored'
    | 'explicit-completed'
    | 'explicit-errored' = 'active';
  let terminalError: unknown;
  let subscription: Subscription | undefined;
  let unsubscribeRequested = false;
  let unsubscribed = false;
  let closeCallbackCalled = false;

  const unsubscribe = () => {
    if (unsubscribed) {
      return;
    }
    if (!subscription) {
      unsubscribeRequested = true;
      return;
    }

    unsubscribed = true;
    subscription.unsubscribe();
  };

  const cleanup = () => {
    if (!closeCallbackCalled) {
      closeCallbackCalled = true;
      onClose?.();
    }
    unsubscribe();
  };

  const completeFromSource = () => {
    if (terminalState !== 'active') {
      return;
    }

    terminalState = 'source-completed';
    for (const pending of pendingNextCalls.splice(0)) {
      pending.resolve({ done: true, value: undefined });
    }
    cleanup();
  };

  const errorFromSource = (error: unknown) => {
    if (terminalState !== 'active') {
      return;
    }

    terminalState = 'source-errored';
    terminalError = error;
    for (const pending of pendingNextCalls.splice(0)) {
      pending.reject(error);
    }
    cleanup();
  };

  const terminateWithCompletion = () => {
    if (
      terminalState === 'explicit-completed' ||
      terminalState === 'explicit-errored'
    ) {
      return;
    }

    terminalState = 'explicit-completed';
    bufferedValues.length = 0;
    for (const pending of pendingNextCalls.splice(0)) {
      pending.resolve({ done: true, value: undefined });
    }
    cleanup();
  };

  const terminateWithError = (error: unknown) => {
    if (
      terminalState === 'explicit-completed' ||
      terminalState === 'explicit-errored'
    ) {
      return;
    }

    terminalState = 'explicit-errored';
    terminalError = error;
    bufferedValues.length = 0;
    for (const pending of pendingNextCalls.splice(0)) {
      pending.reject(error);
    }
    cleanup();
  };

  try {
    subscription = source.subscribe({
      next: (sourceValue) => {
        if (terminalState !== 'active') {
          return;
        }

        let value: U;
        try {
          value = map(sourceValue);
        } catch (error) {
          errorFromSource(error);
          return;
        }

        const pending = pendingNextCalls.shift();
        if (pending) {
          pending.resolve({ done: false, value });
        } else {
          bufferedValues.push(value);
        }
      },
      error: (error) => {
        errorFromSource(error);
      },
      complete: () => {
        completeFromSource();
      },
    });
  } catch (error) {
    errorFromSource(error);
  }
  if (unsubscribeRequested) {
    unsubscribe();
  }

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: () => {
      if (bufferedValues.length > 0) {
        const value = bufferedValues.shift() as U;
        return Promise.resolve({ done: false, value } as IteratorResult<U>);
      }
      if (
        terminalState === 'source-errored' ||
        terminalState === 'explicit-errored'
      ) {
        return Promise.reject(terminalError);
      }
      if (
        terminalState === 'source-completed' ||
        terminalState === 'explicit-completed'
      ) {
        return Promise.resolve({ done: true, value: undefined });
      }

      return new Promise<IteratorResult<U>>((resolve, reject) => {
        pendingNextCalls.push({ resolve, reject });
      });
    },
    return: async (value?: unknown) => {
      terminateWithCompletion();
      return { done: true, value };
    },
    throw: async (error?: unknown) => {
      terminateWithError(error);
      return Promise.reject(error);
    },
    close: terminateWithCompletion,
  };
}
