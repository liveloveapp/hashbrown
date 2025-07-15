import {
  DestroyRef,
  inject,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { SignalLike } from './types';

export function readSignalLike<T extends object | string | number | boolean>(
  signalLike: SignalLike<T>,
): T {
  if (typeof signalLike === 'function') {
    return signalLike();
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
