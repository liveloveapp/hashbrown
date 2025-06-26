/* eslint-disable @typescript-eslint/no-explicit-any */
import { inject, Injector, runInInjectionContext } from '@angular/core';
import {
  RuntimeFunctionRef,
  s,
  ɵcreateRuntimeFunctionImpl,
} from '@hashbrownai/core';

/**
 * Creates a function with an input schema.
 *
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.args - The input schema of the function.
 * @param cfg.result - The result schema of the function.
 * @param cfg.handler - The handler of the function.
 * @returns The function reference.
 */
export function createRuntimeFunction<
  ArgsSchema extends s.HashbrownType,
  ResultSchema extends s.HashbrownType,
>(cfg: {
  name: string;
  description: string;
  args: ArgsSchema;
  result: ResultSchema;
  handler: (
    input: s.Infer<ArgsSchema>,
    abortSignal?: AbortSignal,
  ) => s.Infer<ResultSchema> | Promise<s.Infer<ResultSchema>>;
}): RuntimeFunctionRef<s.Infer<ArgsSchema>, s.Infer<ResultSchema>>;

/**
 * Creates a function without an input schema.
 *
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.result - The result schema of the function.
 * @param cfg.handler - The handler of the function.
 * @returns The function reference.
 */
export function createRuntimeFunction<
  ResultSchema extends s.HashbrownType,
>(cfg: {
  name: string;
  description: string;
  result: ResultSchema;
  handler: (
    abortSignal?: AbortSignal,
  ) => s.Infer<ResultSchema> | Promise<s.Infer<ResultSchema>>;
}): RuntimeFunctionRef<null, s.Infer<ResultSchema>>;

/**
 * Creates a function with an input schema.
 *
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.args - The args schema of the function.
 * @param cfg.handler - The handler of the function.
 * @returns The function reference.
 */
export function createRuntimeFunction<ArgsSchema extends s.HashbrownType>(cfg: {
  name: string;
  description: string;
  args: ArgsSchema;
  handler: (
    args: s.Infer<ArgsSchema>,
    abortSignal?: AbortSignal,
  ) => void | Promise<void>;
}): RuntimeFunctionRef<s.Infer<ArgsSchema>, void>;

/**
 * Creates a function without input or output schema.
 *
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.handler - The handler of the function, which returns void or a promise thereof.
 * @returns The function reference.
 */
export function createRuntimeFunction(cfg: {
  name: string;
  description: string;
  handler: (abortSignal?: AbortSignal) => void | Promise<void>;
}): RuntimeFunctionRef<null, void>;

export function createRuntimeFunction(
  cfg:
    | {
        name: string;
        description: string;
        args: s.HashbrownType;
        result: s.HashbrownType;
        handler: (args: unknown, abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        result: s.HashbrownType;
        handler: (abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        args: s.HashbrownType;
        handler: (args: unknown, abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        handler: (abortSignal?: AbortSignal) => unknown;
      },
): RuntimeFunctionRef<any, any> {
  const injector = inject(Injector);
  return ɵcreateRuntimeFunctionImpl({
    ...cfg,
    handler: (...args: any[]) => {
      return runInInjectionContext(injector, () =>
        (cfg.handler as any)(...args),
      );
    },
  });
}
