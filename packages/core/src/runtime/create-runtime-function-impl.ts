/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import type {
  QuickJSAsyncContext,
  QuickJSHandle,
} from 'quickjs-emscripten-core';
import { RuntimeTransport } from './transport';

/**
 * A reference to a function in the runtime.
 *
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
 * @param cfg - The configuration for the function.
 * @param cfg.name - The name of the function.
 * @param cfg.description - The description of the function.
 * @param cfg.args - The args schema of the function.
 * @param cfg.result - The result schema of the function.
 * @param cfg.handler - The handler of the function.
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

export function attachFunctionToContext(
  context: QuickJSAsyncContext,
  transport: RuntimeTransport,
  definition: RuntimeFunctionRef<any, Promise<any>>,
  attachTo: QuickJSHandle,
  abortSignal: AbortSignal,
) {
  const { name, args: argsSchema, result: resultSchema, handler } = definition;

  const fnHandle = context.newAsyncifiedFunction(name, (...args) => {
    if (argsSchema === undefined && resultSchema === undefined) {
      return handler(null, abortSignal).then(() => context.undefined);
    }

    if (argsSchema === undefined) {
      return handler(null, abortSignal).then((result) =>
        transport.sendObject(result),
      );
    }

    if (resultSchema === undefined) {
      const resolvedArgs = transport.receiveObject(args[0]);
      return handler(resolvedArgs, abortSignal).then(() => context.undefined);
    }

    const resolvedArgs = transport.receiveObject(args[0]);
    return handler(resolvedArgs, abortSignal).then((result) =>
      transport.sendObject(result),
    );
  });

  context.setProp(attachTo, name, fnHandle);
  return fnHandle;
}
