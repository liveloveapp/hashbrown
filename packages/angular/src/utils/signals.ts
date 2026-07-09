import {
  DestroyRef,
  inject,
  isSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import type { ReactiveOption, SignalLike } from './types';

export function readSignalLike<T>(signalLike: SignalLike<T>): T {
  if (isSignal(signalLike)) {
    return signalLike();
  }

  if (typeof signalLike === 'function') {
    return (signalLike as () => T)();
  }

  return signalLike;
}

/**
 * Reads a reactive option without invoking function values.
 *
 * @param option - The literal value or Angular signal to read.
 * @returns The current option value.
 */
export function readReactiveOption<T>(option: ReactiveOption<T>): T {
  return isSignal(option) ? option() : option;
}

type TeardownFn = () => void;

type HashbrownSignal<T> = {
  (): T;
  subscribe(onChange: (newValue: T) => void): TeardownFn;
};

export function toNgSignal<T>(
  source: HashbrownSignal<T>,
  debugName?: string,
): Signal<T> {
  const destroyRef = inject(DestroyRef);
  const options = debugName ? { debugName } : undefined;
  const _signal: WritableSignal<T> = signal(source(), options);

  const teardown = source.subscribe((value) => {
    _signal.set(value);
  });

  destroyRef.onDestroy(() => {
    teardown();
  });

  return _signal.asReadonly();
}
