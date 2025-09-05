/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  RuntimeFunctionRef,
  RuntimeRef,
  ɵcreateRuntimeImpl,
} from '@hashbrownai/core';
import { useMemo } from 'react';

/**
 * Options for creating a runtime.
 *
 * @public
 */
export interface UseRuntimeOptions {
  /**
   * The timeout for the runtime.
   *
   * @defaultValue 10000
   */
  timeout?: number;

  /**
   * The functions that are available in the runtime.
   */
  functions: [...RuntimeFunctionRef<any, any>[]];
}

/**
 * Creates a new runtime.
 *
 * @param options - The options for creating the runtime.
 * @returns A reference to the runtime.
 *
 * @public
 */
export function useRuntime(options: UseRuntimeOptions): RuntimeRef {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const functions = useMemo(() => options.functions, options.functions ?? []);
  const runtime = useMemo(
    () =>
      ɵcreateRuntimeImpl({
        functions,
        timeout: options.timeout,
      }),
    [functions, options.timeout],
  );

  return runtime;
}
