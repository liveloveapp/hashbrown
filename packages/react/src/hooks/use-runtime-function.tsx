/* eslint-disable no-redeclare */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  RuntimeFunctionRef,
  s,
  ɵcreateRuntimeFunctionImpl,
} from '@hashbrownai/core';
import { DependencyList, useCallback, useMemo, useRef } from 'react';

/**
 * Creates a function with an input schema.
 *
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.args - The input schema of the function.
 * @param cfg.result - The result schema of the function.
 * @param cfg.handler - The handler of the function.
 * @param cfg.deps - The dependencies of the function.
 * @returns The function reference.
 */
export function useRuntimeFunction<
  ArgsSchema extends s.HashbrownType,
  ResultSchema extends s.HashbrownType,
>(cfg: {
  name: string;
  description: string;
  deps: DependencyList;
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
 * @param cfg.deps - The dependencies of the function.
 * @returns The function reference.
 */
export function useRuntimeFunction<ResultSchema extends s.HashbrownType>(cfg: {
  name: string;
  description: string;
  deps: DependencyList;
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
 * @param cfg.deps - The dependencies of the function.
 * @returns The function reference.
 */
export function useRuntimeFunction<ArgsSchema extends s.HashbrownType>(cfg: {
  name: string;
  description: string;
  deps: DependencyList;
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
 * @param cfg.deps - The dependencies of the function.
 * @returns The function reference.
 */
export function useRuntimeFunction(cfg: {
  name: string;
  description: string;
  deps: DependencyList;
  handler: (abortSignal?: AbortSignal) => void | Promise<void>;
}): RuntimeFunctionRef<null, void>;

export function useRuntimeFunction(
  cfg:
    | {
        name: string;
        description: string;
        deps: DependencyList;
        args: s.HashbrownType;
        result: s.HashbrownType;
        handler: (args: unknown, abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        deps: DependencyList;
        result: s.HashbrownType;
        handler: (abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        deps: DependencyList;
        args: s.HashbrownType;
        handler: (args: unknown, abort?: AbortSignal) => unknown;
      }
    | {
        name: string;
        description: string;
        deps: DependencyList;
        handler: (abortSignal?: AbortSignal) => unknown;
      },
): RuntimeFunctionRef<any, any> {
  const argsSchemaRef = useRef<s.HashbrownType | undefined>(
    'args' in cfg ? cfg.args : undefined,
  );
  const resultSchemaRef = useRef<s.HashbrownType | undefined>(
    'result' in cfg ? cfg.result : undefined,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handler = useCallback(cfg.handler, cfg.deps);

  const fn = useMemo(() => {
    return ɵcreateRuntimeFunctionImpl({
      args: argsSchemaRef.current,
      result: resultSchemaRef.current,
      handler,
      name: cfg.name,
      description: cfg.description,
    });
  }, [handler, cfg.name, cfg.description]);

  return fn;
}
