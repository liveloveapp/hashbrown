/** Clones and freezes a JSON-compatible AG-UI extension value. @internal */
export function ɵownAgUiJsonValue(value: unknown): unknown {
  return cloneAgUiValue(value, '$', new Set<object>());
}

/**
 * Deep-clones and freezes a JSON-compatible AG-UI value, rejecting anything
 * JSON cannot carry (undefined, non-finite numbers, cycles, sparse arrays,
 * accessors and non-plain objects).
 *
 * @param value - The value to own.
 * @param path - The path reported in validation errors.
 * @param ancestors - Objects on the current path, used to detect cycles.
 * @returns The frozen clone.
 * @throws TypeError when the value is not JSON-compatible.
 * @internal
 */
export function cloneAgUiValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): unknown {
  if (value === undefined) {
    throw invalidAgUiValue(path, 'undefined is not JSON-compatible');
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalidAgUiValue(path, 'numbers must be finite');
    }

    return value;
  }

  if (typeof value !== 'object') {
    throw invalidAgUiValue(path, `${typeof value} is not JSON-compatible`);
  }

  if (ancestors.has(value)) {
    throw invalidAgUiValue(path, 'cyclic values are not JSON-compatible');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (!isArrayIndex(key, value.length)) {
          throw invalidAgUiValue(
            `${path}.${key}`,
            'non-index properties are not supported',
          );
        }
      }

      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor) {
          throw invalidAgUiValue(
            `${path}[${index}]`,
            'sparse arrays are not JSON-compatible',
          );
        }

        if (!('value' in descriptor)) {
          throw invalidAgUiValue(
            `${path}[${index}]`,
            'accessors are not supported',
          );
        }

        clone.push(
          cloneAgUiValue(descriptor.value, `${path}[${index}]`, ancestors),
        );
      }

      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidAgUiValue(path, 'only plain objects are JSON-compatible');
    }

    const clone = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw invalidAgUiValue(`${path}.${key}`, 'accessors are not supported');
      }

      Object.defineProperty(clone, key, {
        configurable: false,
        enumerable: true,
        value: cloneAgUiValue(descriptor.value, `${path}.${key}`, ancestors),
        writable: false,
      });
    }

    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function invalidAgUiValue(path: string, detail: string): TypeError {
  return new TypeError(`Invalid AG-UI message value at ${path}: ${detail}.`);
}
