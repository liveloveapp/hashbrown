/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';

export class BoundTool<
  Name extends string,
  InputSchema extends s.ObjectType<any>,
> {
  constructor(
    readonly name: Name,
    readonly description: string,
    readonly schema: InputSchema,
    readonly handler: (input: s.Infer<InputSchema>) => Promise<any>,
  ) {}

  toTool(): Chat.Tool<Name, InputSchema> {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
    };
  }
}

export function createToolWithArgs<
  Name extends string,
  InputSchema extends s.ObjectType<any>,
>(input: {
  name: Name;
  description: string;
  schema: InputSchema;
  handler: (input: s.Infer<InputSchema>) => Promise<any>;
}): BoundTool<Name, InputSchema> {
  return new BoundTool(
    input.name,
    input.description,
    input.schema,
    input.handler,
  );
}

export function createTool<Name extends string>(input: {
  name: Name;
  description: string;
  handler: () => Promise<any>;
}): BoundTool<Name, s.ObjectType<any>> {
  return createToolWithArgs({
    name: input.name,
    description: input.description,
    schema: s.object('Empty object', {}),
    handler: input.handler,
  });
}
