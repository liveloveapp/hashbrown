/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';
import { useEffect, useMemo, useRef } from 'react';

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

export function createToolWithArgs<
  const Name extends string,
  Schema extends s.HashbrownType,
  Result,
>(
  input: CreateToolWithArgsInput<Name, Schema, Result>,
): Chat.Tool<Name, s.Infer<Schema>, Result> {
  return {
    name: input.name,
    description: input.description,
    schema: input.schema,
    handler: input.handler,
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
  return {
    name: input.name,
    description: input.description,
    schema: s.object('Empty Object', {}),
    handler: input.handler,
  };
}

/**
 * Use tools in a React component.
 *
 * @param tools
 * @returns
 */
export function useTools<Tools extends Chat.AnyTool>(tools: Tools[]) {
  const callbacks = useRef<
    Record<string, (input: any, abortSignal: AbortSignal) => Promise<unknown>>
  >({});

  useEffect(() => {
    for (const tool of tools) {
      callbacks.current[tool.name] = tool.handler;
    }
  }, [tools]);

  return useMemo(() => {
    return tools.map((tool) => ({
      ...tool,
      handler: (input: any, abortSignal: AbortSignal) =>
        callbacks.current[tool.name](input, abortSignal),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...tools.map((tool) => tool.name)]);
}
