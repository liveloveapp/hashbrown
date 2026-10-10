/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';

/**
 * A reference to a function in the runtime.
 *
 * @public
 * @param Args - The args of the function.
 * @param Result - The result of the function.
 * @returns The function reference.
 */
export type RuntimeFunctionRef<Args, Result> = {
  name: string;
  description: string;
  args?: s.HashbrownType;
  result?: s.HashbrownType;
  handler: (args: Args, abortSignal: AbortSignal) => Result | Promise<Result>;
};

/**
 * Creates a function with an input schema.
 *
 * @public
 * @param cfg - The configuration for the function containing:
 *   - `name`: The name of the function
 *   - `description`: The description of the function
 *   - `args`: The args schema of the function
 *   - `result`: The result schema of the function
 *   - `handler`: The handler of the function
 * @returns The function reference.
 */
export function createRuntimeFunctionImpl(
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
  if (!('args' in cfg) && !('result' in cfg)) {
    return {
      name: cfg.name,
      description: cfg.description,
      handler: function (_: null, abortSignal: AbortSignal) {
        return (cfg.handler as (a?: AbortSignal) => void | Promise<void>)(
          abortSignal,
        );
      },
    };
  }

  if (!('args' in cfg)) {
    return {
      name: cfg.name,
      description: cfg.description,
      result: cfg.result,
      handler: function (_: null, abortSignal: AbortSignal) {
        return (cfg.handler as any)(abortSignal);
      },
    };
  }

  if (!('result' in cfg)) {
    return {
      name: cfg.name,
      description: cfg.description,
      args: cfg.args,
      handler: cfg.handler as any,
    };
  }

  return {
    name: cfg.name,
    description: cfg.description,
    args: cfg.args,
    result: cfg.result,
    handler: cfg.handler as any,
  };
}
