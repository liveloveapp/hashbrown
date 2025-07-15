import { ɵdeepEqual } from '@hashbrownai/core';
import { useCallback, useRef, useSyncExternalStore } from 'react';

type TeardownFn = () => void;

type HashbrownSignal<T> = {
  (): T;
  subscribe(onChange: (newValue: T) => void): TeardownFn;
};

/**
 * Connects a Hashbrown Signal to React's reactivity system
 *
 * @param signal The signal to connect to React
 * @returns The value contained in the signal
 */
export function useHashbrownSignal<T>(signal: HashbrownSignal<T>): T {
  const lastValue = useRef<T>(signal());
  const hasSkippedFirstCall = useRef(false);
  const equality = useCallback((a: T, b: T) => ɵdeepEqual(a, b), []);
  const read = useCallback(() => {
    const value = signal();

    if (!equality(value, lastValue.current)) {
      lastValue.current = value;
    }

    return lastValue.current;
  }, [signal, equality]);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let lastRead: T | undefined;

      const cleanup = signal.subscribe((value) => {
        if (!hasSkippedFirstCall.current) {
          hasSkippedFirstCall.current = true;
          return;
        }

        const currentValue = read();

        if (currentValue !== lastRead) {
          lastRead = currentValue;
          onStoreChange();
        }
      });

      return () => {
        cleanup();
        hasSkippedFirstCall.current = false;
      };
    },
    [signal, read],
  );

  return useSyncExternalStore(subscribe, read);
}
