import { Chat, s } from '@hashbrownai/core';
import {
  inject,
  Injector,
  runInInjectionContext,
  untracked,
} from '@angular/core';

/**
 * Creates a tool with a schema.
 *
 * @param input - The input for the tool.
 * @param input.name - The name of the tool.
 * @param input.description - The description of the tool.
 * @param input.schema - The schema of the tool.
 * @param input.handler - The handler of the tool.
 * @param Name - The name of the tool.
 * @param Schema - The schema of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function createTool<
  const Name extends string,
  Schema extends s.HashbrownType,
  Result,
>(input: {
  name: Name;
  description: string;
  schema: Schema;
  handler: (
    input: s.Infer<Schema>,
    abortSignal: AbortSignal,
  ) => Promise<Result>;
}): Chat.Tool<Name, s.Infer<Schema>, Result>;

/**
 * Creates a tool without a schema.
 *
 * @param input - The input for the tool.
 * @param input.name - The name of the tool.
 * @param input.description - The description of the tool.
 * @param input.handler - The handler of the tool.
 * @param Name - The name of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function createTool<const Name extends string, Result>(input: {
  name: Name;
  description: string;
  handler: (abortSignal: AbortSignal) => Promise<Result>;
}): Chat.Tool<Name, void, Result>;

export function createTool(
  input:
    | {
        name: string;
        description: string;
        schema: s.HashbrownType;
        handler: (a: unknown, s: AbortSignal) => Promise<unknown>;
      }
    | {
        name: string;
        description: string;
        handler: (s: AbortSignal) => Promise<unknown>;
      },
): unknown {
  const injector = inject(Injector);

  if ('schema' in input) {
    const { name, description, schema, handler } = input;
    return {
      name,
      description,
      schema,
      handler: (args: unknown, abortSignal: AbortSignal) =>
        untracked(() =>
          runInInjectionContext(injector, () => handler(args, abortSignal)),
        ),
    };
  } else {
    const { name, description, handler } = input;
    return {
      name,
      description,
      schema: s.object('Empty Object', {}),
      handler: (_: void, abortSignal: AbortSignal) =>
        untracked(() =>
          runInInjectionContext(injector, () => handler(abortSignal)),
        ),
    };
  }
}
