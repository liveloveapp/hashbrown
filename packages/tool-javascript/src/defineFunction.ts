/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '@hashbrownai/core';
import { QuickJSAsyncContext, QuickJSHandle } from 'quickjs-emscripten';
import { RuntimeTransport } from './transport';

export type VMFunctionDefinition<Input, Output> = {
  name: string;
  description: string;
  input: s.HashbrownType;
  output: s.HashbrownType;
  handler: (input: Input, abortSignal: AbortSignal) => Output | Promise<Output>;
};

export function defineFunction<OutputSchema extends s.HashbrownType>(args: {
  name: string;
  description: string;
  output: OutputSchema;
  handler: (
    abortSignal?: AbortSignal,
  ) => s.Infer<OutputSchema> | Promise<s.Infer<OutputSchema>>;
}): VMFunctionDefinition<null, s.Infer<OutputSchema>> {
  return {
    name: args.name,
    description: args.description,
    input: s.nullish(),
    output: args.output,
    handler: function (input: null, abortSignal: AbortSignal) {
      return args.handler(abortSignal);
    },
  };
}

export function defineFunctionWithArgs<
  InputSchema extends s.HashbrownType,
  OutputSchema extends s.HashbrownType,
>(args: {
  name: string;
  description: string;
  input: InputSchema;
  output: OutputSchema;
  handler: (
    input: s.Infer<InputSchema>,
    abortSignal?: AbortSignal,
  ) => s.Infer<OutputSchema> | Promise<s.Infer<OutputSchema>>;
}): VMFunctionDefinition<s.Infer<InputSchema>, s.Infer<OutputSchema>> {
  return {
    name: args.name,
    description: args.description,
    input: args.input,
    output: args.output,
    handler: args.handler,
  };
}

export function attachFunctionToContext(
  context: QuickJSAsyncContext,
  transport: RuntimeTransport,
  definition: VMFunctionDefinition<any, Promise<any>>,
  attachTo: QuickJSHandle,
  abortSignal: AbortSignal,
) {
  const { name, input, handler } = definition;

  const fnHandle = context.newAsyncifiedFunction(name, (...args) => {
    if (s.isNullType(input)) {
      return handler(null, abortSignal).then((result) => {
        return transport.sendObject(result);
      });
    }

    const resolvedInput = transport.receiveObject(args[0]);

    return handler(resolvedInput, abortSignal).then((result) => {
      return transport.sendObject(result);
    });
  });

  context.setProp(attachTo, name, fnHandle);

  return fnHandle;
}
