import type { JsonValue } from './types';

/**
 * Owns an optional JSON-compatible value without mutating the input.
 *
 * @internal
 */
export function cloneAndFreezeOptionalJsonValue(
  value: unknown,
): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return cloneJsonValue(value, '$', new Set<object>());
}

function cloneJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidJsonValue(path, 'numbers must be finite');
    }

    return value;
  }

  if (value === undefined) {
    throw invalidJsonValue(path, 'undefined is only allowed at the root');
  }

  if (typeof value !== 'object') {
    throw invalidJsonValue(path, `${typeof value} is not JSON-compatible`);
  }

  if (ancestors.has(value)) {
    throw invalidJsonValue(path, 'cyclic values are not JSON-compatible');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const clone: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw invalidJsonValue(
            `${path}[${index}]`,
            'sparse arrays are not JSON-compatible',
          );
        }

        clone.push(
          cloneJsonValue(value[index], `${path}[${index}]`, ancestors),
        );
      }

      return Object.freeze(clone) as unknown as JsonValue;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidJsonValue(path, 'only plain objects are JSON-compatible');
    }

    const clone = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value)) {
      const child = cloneJsonValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        ancestors,
      );
      Object.defineProperty(clone, key, {
        configurable: false,
        enumerable: true,
        value: child,
        writable: false,
      });
    }

    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function invalidJsonValue(path: string, detail: string): TypeError {
  return new TypeError(`Invalid JSON value at ${path}: ${detail}.`);
}
