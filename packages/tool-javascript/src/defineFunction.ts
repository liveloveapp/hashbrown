/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '@hashbrownai/core';
import { QuickJSAsyncContext, QuickJSHandle } from 'quickjs-emscripten';
import { Transport } from './transport';

export type VMFunctionDefinition<
  Output extends s.HashbrownType,
  Schema extends s.HashbrownType,
> = {
  name: string;
  description: string;
  schema: Schema;
  output: Output;
  handler: (
    input?: s.Infer<Schema>,
  ) => s.Infer<Output> | Promise<s.Infer<Output>>;
};

export function defineFunction<Output extends s.HashbrownType>(args: {
  name: string;
  description: string;
  output: Output;
  handler: () => s.Infer<Output> | Promise<s.Infer<Output>>;
}): VMFunctionDefinition<Output, s.NullType> {
  return {
    schema: s.nullType(),
    ...args,
  };
}

export function defineFunctionWithArgs<
  Output extends s.HashbrownType,
  Schema extends s.HashbrownType,
>(args: {
  name: string;
  description: string;
  schema: Schema;
  output: Output;
  handler: (
    input: s.Infer<Schema>,
  ) => s.Infer<Output> | Promise<s.Infer<Output>>;
}): VMFunctionDefinition<Output, Schema> {
  return args;
}

export function attachFunctionToContext(
  context: QuickJSAsyncContext,
  transport: Transport,
  definition: VMFunctionDefinition<s.HashbrownType<any>, s.HashbrownType<any>>,
  attachTo: QuickJSHandle,
) {
  const { name, schema: input, output, handler } = definition;

  const fnHandle = context.newAsyncifiedFunction(name, async (...args) => {
    if (s.isNullType(input)) {
      const result = await handler();
      return transport.sendObject(output.parseJsonSchema(result));
    }

    const resolvedInput = transport.receiveObject(args[0]);
    const parsedInput = input.parseJsonSchema(resolvedInput);
    const result = await handler(parsedInput);
    return transport.sendObject(output.parseJsonSchema(result));
  });

  context.setProp(attachTo, name, fnHandle);

  return fnHandle;
}
