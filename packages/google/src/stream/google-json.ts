import { ɵreadProviderHistory } from '@hashbrownai/core';

function invalid(): never {
  throw new TypeError('Google native value must be JSON-compatible');
}

function cloneSdkJson(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) invalid();
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== null && prototype !== Object.prototype) {
    const constructor = Object.getOwnPropertyDescriptor(
      prototype,
      'constructor',
    );
    if (
      Object.getPrototypeOf(prototype) !== null ||
      !constructor ||
      !('value' in constructor) ||
      typeof constructor.value !== 'function' ||
      Function.prototype.toString.call(constructor.value) !==
        Function.prototype.toString.call(Object)
    )
      invalid();
  }
  ancestors.add(value);
  try {
    const result = array ? new Array(value.length) : Object.create(null);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) invalid();
      Object.defineProperty(result, key, {
        value: cloneSdkJson(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Owns SDK JSON across runtime realms without invoking accessors or applying JSON coercions.
 *
 * @param value - Native SDK data, including plain objects parsed by a host-realm fetch implementation.
 * @returns A deeply frozen JSON value with owned data properties.
 * @throws TypeError when the value contains classes, accessors, cycles or non-JSON data.
 * @internal
 */
export function ownGoogleJson<T>(value: T): T {
  const envelope = ɵreadProviderHistory({
    v: 1,
    provider: 'google',
    ownerMessageId: 'capture',
    responseId: 'capture',
    complete: false,
    payload: { value: cloneSdkJson(value, new Set()) },
  });
  if (!envelope) invalid();
  return envelope.payload['value'] as T;
}
