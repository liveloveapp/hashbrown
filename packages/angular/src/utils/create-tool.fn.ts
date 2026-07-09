/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';
import { Injector, runInInjectionContext, untracked } from '@angular/core';

/**
 * Creates a tool with a schema.
 *
 * @public
 * @param input - The input for the tool containing:
 *   - `name`: The name of the tool
 *   - `description`: The description of the tool
 *   - `schema`: The schema of the tool
 *   - `handler`: The handler of the tool
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
 * Creates a tool with a Standard JSON Schema.
 *
 * @public
 * @param input - The input for the tool containing:
 *   - `name`: The name of the tool
 *   - `description`: The description of the tool
 *   - `schema`: The schema of the tool
 *   - `handler`: The handler of the tool
 * @param Name - The name of the tool.
 * @param Schema - The schema of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function createTool<
  const Name extends string,
  Schema extends s.StandardJSONSchemaV1,
  Result,
>(input: {
  name: Name;
  description: string;
  schema: Schema;
  handler: (
    input: s.StandardJSONSchemaV1.InferInput<Schema>,
    abortSignal: AbortSignal,
  ) => Promise<Result>;
}): Chat.Tool<Name, s.StandardJSONSchemaV1.InferInput<Schema>, Result>;

/**
 * Creates a tool with a unknown JSON schema.
 *
 * @public
 * @param input - The input for the tool containing:
 *   - `name`: The name of the tool
 *   - `description`: The description of the tool
 *   - `schema`: The schema of the tool
 *   - `handler`: The handler of the tool
 * @param Name - The name of the tool.
 * @param Schema - The schema of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function createTool<const Name extends string, Result>(input: {
  name: Name;
  description: string;
  schema: object;
  handler: (input: any, abortSignal: AbortSignal) => Promise<Result>;
}): Chat.Tool<Name, any, Result>;

/**
 * Creates a tool without a schema.
 *
 * @public
 * @param input - The input for the tool containing:
 *   - `name`: The name of the tool
 *   - `description`: The description of the tool
 *   - `handler`: The handler of the tool
 * @param Name - The name of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function createTool<const Name extends string, Result>(input: {
  name: Name;
  description: string;
  handler: (abortSignal: AbortSignal) => Promise<Result>;
}): Chat.Tool<Name, void, Result>;

/**
 * @public
 */
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
      }
    | {
        name: string;
        description: string;
        schema: object;
        handler: (a: unknown, s: AbortSignal) => Promise<unknown>;
      },
): unknown {
  if ('schema' in input) {
    const { name, description, schema, handler } = input;
    return {
      name,
      description,
      schema,
      handler: (args: unknown, abortSignal: AbortSignal) =>
        handler(args, abortSignal),
    };
  } else {
    const { name, description, handler } = input;
    return {
      name,
      description,
      schema: s.object('Empty Object', {}),
      handler: (_: void, abortSignal: AbortSignal) => handler(abortSignal),
    };
  }
}

export function bindToolToInjector<
  T extends Chat.Tool<string, unknown, unknown>,
>(tool: T, injector: Injector): T {
  return {
    ...tool,
    handler: (args: unknown, abortSignal: AbortSignal) =>
      untracked(() =>
        runInInjectionContext(injector, () => tool.handler(args, abortSignal)),
      ),
  };
}
