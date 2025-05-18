/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';
import { useEffect, useMemo, useRef } from 'react';

export function createToolWithArgs<
  const Name extends string,
  InputSchema extends s.HashbrownType,
  Output,
>(input: {
  name: Name;
  description: string;
  schema: InputSchema;
  handler: (input: s.Infer<InputSchema>) => Promise<Output>;
}): Chat.Tool<Name, InputSchema, Output> {
  return {
    name: input.name,
    description: input.description,
    schema: input.schema,
    handler: input.handler,
  };
}

export function createTool<Name extends string, Output>(input: {
  name: Name;
  description: string;
  handler: () => Promise<Output>;
}): Chat.Tool<Name, s.ObjectType<Record<string, s.HashbrownType>>, Output> {
  return createToolWithArgs({
    name: input.name,
    description: input.description,
    schema: s.object('Empty object', {}),
    handler: input.handler,
  });
}

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
