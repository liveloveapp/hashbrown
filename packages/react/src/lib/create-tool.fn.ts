import { Chat, s } from '@hashbrownai/core';

export class BoundTool<
  Name extends string,
  InputSchema extends s.ObjectType<Record<string, s.AnyType>>,
> {
  constructor(
    readonly name: Name,
    readonly description: string,
    readonly schema: InputSchema,
    readonly handler: (input: s.Infer<InputSchema>) => Promise<unknown>,
  ) {}

  toTool(): Chat.Tool<Name> {
    return {
      name: this.name,
      description: this.description,
      schema: s.toJsonSchema(this.schema), // GPT-4o
      //schema: s.toOpenApiSchema(this.schema), // Gemini
    };
  }
}

export function createToolWithArgs<
  Name extends string,
  InputSchema extends s.ObjectType<Record<string, s.AnyType>>,
>(input: {
  name: Name;
  description: string;
  schema: InputSchema;
  handler: (input: s.Infer<InputSchema>) => Promise<unknown>;
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
  handler: () => Promise<unknown>;
}): BoundTool<Name, s.ObjectType<Record<string, s.AnyType>>> {
  return createToolWithArgs({
    name: input.name,
    description: input.description,
    schema: s.object('Empty object', {}),
    handler: input.handler,
  });
}
