/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  RuntimeFunctionRef,
  RuntimeRef,
  ɵcreateRuntimeImpl,
} from '@hashbrownai/core';

/**
 * Options for creating a runtime.
 */
export interface CreateRuntimeOptions {
  /**
   * The timeout for the runtime.
   *
   * @default 10000
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
 */
export function createRuntime(options: CreateRuntimeOptions): RuntimeRef {
  return ɵcreateRuntimeImpl(options);
}
