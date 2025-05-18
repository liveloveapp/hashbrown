import { Signal, signal, WritableSignal } from '@angular/core';
import { SignalLike } from './types';

export function readSignalLike<T extends object | string | number | boolean>(
  signalLike: SignalLike<T>,
): T {
  if (typeof signalLike === 'function') {
    return signalLike();
  }

  return signalLike;
}

export function toSignal<T>(
  source: (observer: (value: T) => void) => void,
): Signal<T> {
  // eslint-disable-next-line prefer-const
  let _signal: WritableSignal<T> | undefined;
  let initialValue: T | undefined;

  source((value) => {
    if (_signal) {
      _signal.set(value);
    } else {
      initialValue = value;
    }
  });

  if (initialValue === undefined) {
    throw new Error('Initial value is required');
  }

  _signal = signal(initialValue);

  return _signal.asReadonly();
}
