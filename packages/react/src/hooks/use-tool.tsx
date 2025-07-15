/* eslint no-redeclare: off */
import { Chat, s } from '@hashbrownai/core';
import { type DependencyList, useCallback, useMemo, useState } from 'react';

export interface ToolOptionsWithInput<
  Name extends string,
  Schema extends s.HashbrownType,
  Result,
> {
  /**
   * The name of the tool.
   */
  name: Name;

  /**
   * The description of the tool. This helps the LLM understand its purpose.
   */
  description: string;

  /**
   * The schema that describes the input for the tool.
   */
  schema: Schema;

  /**
   * The handler of the tool. This is what the LLM agent will call
   * to execute the tool, passing in an input that adheres to the schema.
   */
  handler: (
    input: s.Infer<Schema>,
    abortSignal: AbortSignal,
  ) => Promise<Result>;

  /**
   * Dependencies that should trigger tool recreation.
   * The hook will automatically memoize the handler based on these dependencies,
   * so you can safely pass anonymous functions.
   */
  deps: DependencyList;
}

export interface ToolOptionsWithoutInput<Name extends string, Result> {
  /**
   * The name of the tool.
   */
  name: Name;

  /**
   * The description of the tool. This helps the LLM understand its purpose.
   */
  description: string;

  /**
   * The handler of the tool. This is what the LLM agent will call
   * to execute the tool.
   */
  handler: (abortSignal: AbortSignal) => Promise<Result>;

  /**
   * Dependencies that should trigger tool recreation.
   * The hook will automatically memoize the handler based on these dependencies,
   * so you can safely pass anonymous functions.
   */
  deps: DependencyList;
}

export type ToolOptions<
  Name extends string,
  Schema extends s.HashbrownType = s.HashbrownType,
  Result = unknown,
> =
  | ToolOptionsWithInput<Name, Schema, Result>
  | ToolOptionsWithoutInput<Name, Result>;

/**
 * Creates a tool with a schema.
 *
 * @param input - The input for the tool.
 * @param input.name - The name of the tool.
 * @param input.description - The description of the tool.
 * @param input.schema - The schema of the tool.
 * @param input.handler - The handler of the tool.
 * @param deps - Dependencies that should trigger tool recreation.
 *               The hook will automatically memoize the handler based on these dependencies,
 *               so you can safely pass anonymous functions.
 * @param Name - The name of the tool.
 * @param Schema - The schema of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function useTool<
  const Name extends string,
  Schema extends s.HashbrownType,
  Result,
>(
  input: ToolOptionsWithInput<Name, Schema, Result>,
): Chat.Tool<Name, s.Infer<Schema>, Result>;

/**
 * Creates a tool.
 *
 * @param input - The input for the tool.
 * @param input.name - The name of the tool.
 * @param input.description - The description of the tool.
 * @param input.schema - The schema of the tool.
 * @param input.handler - The handler of the tool.
 * @param deps - Dependencies that should trigger tool recreation.
 *               The hook will automatically memoize the handler based on these dependencies,
 *               so you can safely pass anonymous functions.
 * @param Name - The name of the tool.
 * @param Schema - The schema of the tool.
 * @param Result - The result of the tool.
 * @returns The tool.
 */
export function useTool<const Name extends string, Result>(
  input: ToolOptionsWithoutInput<Name, Result>,
): Chat.Tool<Name, void, Result>;

export function useTool<const Name extends string>(
  input:
    | {
        name: Name;
        description: string;
        schema: s.HashbrownType;
        handler: (a: unknown, s: AbortSignal) => Promise<unknown>;
        deps: DependencyList;
      }
    | {
        name: Name;
        description: string;
        handler: (s: AbortSignal) => Promise<unknown>;
        deps: DependencyList;
      },
): unknown {
  const { name, description, handler, deps } = input;

  // assumes the schema will never change
  const [schema] = useState(
    'schema' in input ? input.schema : s.object('Empty schema', {}),
  );
  // assumes the handler should only change if its deps change,
  //   which enables the use of anonymous functions in the handler.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, deps);

  const tool = useMemo(() => {
    return {
      name,
      description,
      schema,
      handler: stableHandler,
    };
  }, [name, description, schema, stableHandler]);

  return tool;
}
