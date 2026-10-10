/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  QuickJSAsyncContext,
  QuickJSHandle,
} from 'quickjs-emscripten-core';
import type { RuntimeFunctionRef } from './create-runtime-function-impl';
import { RuntimeTransport } from './transport';

/**
 * Exposes a runtime function to code running inside the QuickJS sandbox.
 *
 * Kept out of `create-runtime-function-impl` on purpose: QuickJS is bundled
 * into Core's JavaScript output, so its types must never be reachable from the
 * public declaration files.
 *
 * @internal
 * @param context - The QuickJS context to attach the function to.
 * @param transport - Moves values between the host and the sandbox.
 * @param definition - The runtime function to expose.
 * @param attachTo - The sandbox object that receives the function.
 * @param abortSignal - Aborts the handler when the run is cancelled.
 * @returns The handle of the attached function.
 */
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
