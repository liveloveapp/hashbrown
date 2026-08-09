import {
  computed,
  type ResourceSnapshot,
  type ResourceStatus,
  type Signal,
} from '@angular/core';

const missingErrorMessage = 'Resource failed without an error';

/**
 * Creates a public resource value signal that throws only in the error state.
 *
 * @param rawValue - The unguarded resource value signal.
 * @param status - The resource status signal.
 * @param error - The resource error signal.
 * @param debugName - Optional name used for Angular signal debugging.
 * @returns A guarded signal for the public resource value.
 */
export function createResourceValue<T>(
  rawValue: Signal<T>,
  status: Signal<ResourceStatus>,
  error: Signal<Error | undefined>,
  debugName?: string,
): Signal<T> {
  return computed(
    () => {
      if (status() === 'error') {
        throw resolveResourceError(error());
      }

      return rawValue();
    },
    { debugName },
  );
}

/**
 * Creates a resource snapshot from separate value, status, and error signals.
 */
export function createResourceSnapshot<T>(
  value: Signal<T>,
  status: Signal<ResourceStatus>,
  error: Signal<Error | undefined>,
  debugName?: string,
): Signal<ResourceSnapshot<T>> {
  return computed(
    (): ResourceSnapshot<T> => {
      const currentStatus = status();

      if (currentStatus === 'error') {
        return {
          status: currentStatus,
          error: resolveResourceError(error()),
        };
      }

      return { status: currentStatus, value: value() };
    },
    { debugName },
  );
}

/**
 * Returns the reported resource error or a consistent fallback error.
 *
 * @param error - The reported resource error, if one exists.
 * @returns The reported error or a new fallback error.
 */
function resolveResourceError(error: Error | undefined): Error {
  return error ?? new Error(missingErrorMessage);
}
