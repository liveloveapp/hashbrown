/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';
import {
  inject,
  Injector,
  runInInjectionContext,
  untracked,
} from '@angular/core';

export class BoundTool<
  Name extends string,
  InputSchema extends s.ObjectType<any>,
  Result,
> implements Chat.Tool<Name, InputSchema, Result>
{
  constructor(
    readonly name: Name,
    readonly description: string,
    readonly schema: InputSchema,
    readonly handler: (input: s.Infer<InputSchema>) => Promise<Result>,
  ) {}
}

export function createToolWithArgs<
  const Name extends string,
  InputSchema extends s.ObjectType<any>,
  Result,
>(input: {
  name: Name;
  description: string;
  schema: InputSchema;
  handler: (input: s.Infer<InputSchema>) => Promise<Result>;
}): Chat.Tool<Name, InputSchema, Result> {
  const injector = inject(Injector);

  return new BoundTool(input.name, input.description, input.schema, (args) => {
    return untracked(() =>
      runInInjectionContext(injector, () => input.handler(args)),
    );
  });
}

export function createTool<const Name extends string, Result>(input: {
  name: Name;
  description: string;
  handler: () => Promise<Result>;
}): Chat.Tool<Name, s.ObjectType<object>, Result> {
  return createToolWithArgs({
    name: input.name,
    description: input.description,
    schema: s.object('Empty object', {}),
    handler: input.handler,
  });
}
