/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, isSignal, Signal, untracked } from '@angular/core';
import { IsKnownRecord } from './ts-helpers';

/**
 * Symbol used to mark signals that were created by toDeepSignal.
 * This helps us identify and clean up stale deep signal properties
 * when the structure of the data changes.
 */
const DEEP_SIGNAL = Symbol('DEEP_SIGNAL');

/**
 * DeepSignal type allows accessing nested properties of a signal as signals themselves.
 *
 * For plain objects (IsKnownRecord), it recursively applies DeepSignal to nested properties.
 * For non-objects or built-in types (arrays, dates, etc.), it returns unknown to prevent
 * deep signal property access.
 *
 * @example
 * ```typescript
 * const state = signal({ user: { name: 'John', age: 30 } });
 * const deepState = toDeepSignal(state);
 *
 * // All of these work and return signals:
 * deepState()              // Signal<{ user: { name: string, age: number } }>
 * deepState.user()         // Signal<{ name: string, age: number }>
 * deepState.user.name()    // Signal<string>
 * deepState.user.age()     // Signal<number>
 * ```
 *
 * @public
 */
export type DeepSignal<T> = Signal<T> &
  (IsKnownRecord<T> extends true
    ? Readonly<{
        [K in keyof T]: IsKnownRecord<T[K]> extends true
          ? DeepSignal<T[K]>
          : Signal<T[K]>;
      }>
    : unknown);

/**
 * Converts a Signal to a DeepSignal, allowing reactive access to nested properties.
 *
 * This implementation is lifted from @ngrx/signals and uses a Proxy to lazily create
 * computed signals for nested properties as they are accessed.
 *
 * @param signal - The signal to convert to a deep signal
 * @returns A DeepSignal that allows accessing nested properties as signals
 *
 * @remarks
 * The implementation uses a Proxy to intercept property access and lazily creates
 * computed signals for nested properties. This ensures:
 * - Minimal memory overhead (signals are only created when accessed)
 * - Automatic cleanup of stale signals when data structure changes
 * - Full reactivity for nested properties
 *
 * @example
 * ```typescript
 * const messages = signal([{ content: { text: 'Hello' } }]);
 * const deepMessages = toDeepSignal(messages);
 *
 * // In a component or effect:
 * effect(() => {
 *   // This will re-run when the text changes
 *   console.log(deepMessages()[0].content.text);
 * });
 * ```
 *
 * @public
 */
export function toDeepSignal<T>(signal: Signal<T>): DeepSignal<T> {
  return new Proxy(signal, {
    has(target: any, prop) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return !!this.get!(target, prop, undefined);
    },
    get(target: any, prop) {
      const value = untracked(target);
      if (!isRecord(value) || !(prop in value)) {
        if (isSignal(target[prop]) && (target[prop] as any)[DEEP_SIGNAL]) {
          delete target[prop];
        }

        return target[prop];
      }

      if (!isSignal(target[prop])) {
        Object.defineProperty(target, prop, {
          value: computed(() => target()[prop]),
          configurable: true,
        });
        target[prop][DEEP_SIGNAL] = true;
      }

      return toDeepSignal(target[prop]);
    },
  });
}

const nonRecords = [
  WeakSet,
  WeakMap,
  Promise,
  Date,
  Error,
  RegExp,
  ArrayBuffer,
  DataView,
  Function,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || isIterable(value)) {
    return false;
  }

  let proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype) {
    return true;
  }

  while (proto && proto !== Object.prototype) {
    if (nonRecords.includes(proto.constructor)) {
      return false;
    }
    proto = Object.getPrototypeOf(proto);
  }

  return proto === Object.prototype;
}

function isIterable(value: any): value is Iterable<any> {
  return typeof value?.[Symbol.iterator] === 'function';
}
