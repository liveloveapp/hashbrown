import { s } from '@hashbrownai/core';
import { QuickJSAsyncContext, QuickJSHandle } from 'quickjs-emscripten';
import { Transport } from './transport';

type VMFunctionDefinition<
  Output extends s.HashbrownType,
  Args extends s.HashbrownType[],
> = {
  name: string;
  description: string;
  input: [...Args];
  output: Output;
  handler: (input: [...Args]) => Output | Promise<Output>;
};

export function defineFunction<
  Output extends s.HashbrownType,
  Args extends s.HashbrownType[],
>(args: {
  name: string;
  description: string;
  input: [...Args];
  output: Output;
  handler: (input: [...Args]) => Output | Promise<Output>;
}) {
  return args;
}

export function attachFunctionToContext(
  context: QuickJSAsyncContext,
  transport: Transport,
  definition: VMFunctionDefinition<
    s.HashbrownType<any>,
    s.HashbrownType<any>[]
  >,
  attachTo: QuickJSHandle,
) {
  const { name, input, output, handler } = definition;

  const fnHandle = context.newAsyncifiedFunction(name, async (...args) => {
    const resolvedArgs: any = args.map((arg, index) => {
      const type = input[index];
      const resolvedValue = transport.receiveObject(arg);

      return s.parse(type, resolvedValue);
    });

    // eslint-disable-next-line prefer-spread
    const result: any = await handler.apply(null, resolvedArgs);

    return transport.sendObject(s.parse(output, result));
  });

  context.setProp(attachTo, name, fnHandle);

  return fnHandle;
}
