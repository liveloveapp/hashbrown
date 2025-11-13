import {
  DestroyRef,
  inject,
  isSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { SignalLike } from './types';

export function readSignalLike<T>(signalLike: SignalLike<T>): T {
  if (isSignal(signalLike)) {
    return signalLike();
  }

  if (typeof signalLike === 'function') {
    return (signalLike as () => T)();
  }

  return signalLike;
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
  const _signal: WritableSignal<T> = signal(source(), {
    debugName,
  });

  const teardown = source.subscribe((value) => {
    _signal.set(value);
  });

  destroyRef.onDestroy(() => {
    teardown();
  });

  return _signal.asReadonly();
}
