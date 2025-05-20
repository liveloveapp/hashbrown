import { Chat, s } from '@hashbrownai/core';
import {
  inject,
  Injector,
  runInInjectionContext,
  untracked,
} from '@angular/core';

/**
 * Input for the createToolWithArgs function.
 */
export interface CreateToolWithArgsInput<
  Name extends string,
  Schema extends s.HashbrownType,
  Result,
> {
  name: Name;
  description: string;
  schema: Schema;
  handler: (input: s.Infer<Schema>) => Promise<Result>;
}

/**
 * Creates a tool with a schema and a handler that takes the schema as an argument.
 *
 * @param input
 * @returns
 */
export function createToolWithArgs<
  const Name extends string,
  Schema extends s.HashbrownType,
  Result,
>(
  input: CreateToolWithArgsInput<Name, Schema, Result>,
): Chat.Tool<Name, s.Infer<Schema>, Result> {
  const injector = inject(Injector);

  return {
    name: input.name,
    description: input.description,
    schema: input.schema,
    handler: (args) => {
      return untracked(() =>
        runInInjectionContext(injector, () => input.handler(args)),
      );
    },
  };
}

/**
 * Input for the createTool function.
 */
export interface CreateToolInput<Name extends string, Result> {
  name: Name;
  description: string;
  handler: () => Promise<Result>;
}

/**
 * Creates a tool with a handler that takes no arguments.
 *
 * @param input
 * @returns
 */
export function createTool<const Name extends string, Result>(
  input: CreateToolInput<Name, Result>,
): Chat.Tool<Name, void, Result> {
  const injector = inject(Injector);

  return {
    name: input.name,
    description: input.description,
    schema: s.object('Empty Object', {}),
    handler: () => {
      return untracked(() =>
        runInInjectionContext(injector, () => input.handler()),
      );
    },
  };
}
