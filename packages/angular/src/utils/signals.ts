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
  debugName?: string,
): Signal<T> {
  // eslint-disable-next-line prefer-const
  let _signal: WritableSignal<T> | undefined;
  let initialValue: T;

  source((value) => {
    if (_signal) {
      _signal.set(value);
    } else {
      initialValue = value;
    }
  });

  _signal = signal(
    initialValue!,
    debugName
      ? {
          debugName,
        }
      : {},
  );

  return _signal.asReadonly();
}
