/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  RuntimeFunctionRef,
  RuntimeRef,
  ɵcreateRuntimeImpl,
} from '@hashbrownai/core';

/**
 * Options for creating a runtime.
 *
 * @public
 */
export interface CreateRuntimeOptions {
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
 * @public
 * @param options - The options for creating the runtime.
 * @returns A reference to the runtime.
 */
export function createRuntime(options: CreateRuntimeOptions): RuntimeRef {
  return ɵcreateRuntimeImpl(options);
}
