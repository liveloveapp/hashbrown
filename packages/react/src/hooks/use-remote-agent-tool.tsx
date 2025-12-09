/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, s } from '@hashbrownai/core';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  type ToolOptions,
  type ToolOptionsWithInput,
  type ToolOptionsWithUnknownSchema,
  type ToolOptionsWithoutInput,
  useTool,
} from './use-tool';

/**
 * Represents a tool that has been registered for remote agents.
 *
 * @public
 */
export interface RemoteToolRegistration {
  tool: Chat.AnyTool;
  parameters?: object;
  acceptsArguments: boolean;
}

interface RemoteToolsStore {
  register(tool: RemoteToolRegistration): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RemoteToolRegistration[];
}

const createRemoteToolsStore = (): RemoteToolsStore => {
  let tools: RemoteToolRegistration[] = [];
  const listeners = new Set<() => void>();

  return {
    register: (tool: RemoteToolRegistration) => {
      tools = [...tools, tool];
      listeners.forEach((listener) => listener());
      return () => {
        tools = tools.filter((entry) => entry !== tool);
        listeners.forEach((listener) => listener());
      };
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => tools,
  };
};

const defaultStore = createRemoteToolsStore();

/**
 * Holds the registered remote tools.
 *
 * @public
 */
export const RemoteToolsContext =
  createContext<RemoteToolsStore>(defaultStore);

/**
 * Provides an isolated store for remote tools.
 *
 * @public
 */
export const RemoteToolsProvider = (props: { children: ReactNode }) => {
  const { children } = props;
  const storeRef = useRef<RemoteToolsStore>();

  if (!storeRef.current) {
    storeRef.current = createRemoteToolsStore();
  }

  return (
    <RemoteToolsContext.Provider value={storeRef.current}>
      {children}
    </RemoteToolsContext.Provider>
  );
};

export const useRemoteToolsStore = () => useContext(RemoteToolsContext);

const toJsonSchema = (schema: s.HashbrownType | object | undefined) => {
  if (!schema) {
    return undefined;
  }

  return s.isHashbrownType(schema) ? s.toJsonSchema(schema) : schema;
};

const useRegisterRemoteTool = (
  tool: Chat.AnyTool,
  acceptsArguments: boolean,
) => {
  const store = useRemoteToolsStore();
  const parameters = useMemo(() => toJsonSchema(tool.schema), [tool.schema]);

  useEffect(() => {
    if (!store) {
      return;
    }
    const unregister = store.register({
      tool,
      parameters,
      acceptsArguments,
    });
    return unregister;
  }, [acceptsArguments, parameters, store, tool]);
};

/**
 * Registers a remote agent tool with an input schema.
 *
 * @public
 */
export function useRemoteAgentTool<
  const Name extends string,
  Schema extends s.HashbrownType,
  Result,
>(
  input: ToolOptionsWithInput<Name, Schema, Result>,
): Chat.Tool<Name, s.Infer<Schema>, Result>;

/**
 * Registers a remote agent tool with an unknown schema.
 *
 * @public
 */
export function useRemoteAgentTool<const Name extends string, Result>(
  input: ToolOptionsWithUnknownSchema<Name, Result>,
): Chat.Tool<Name, any, Result>;

/**
 * Registers a remote agent tool without an input schema.
 *
 * @public
 */
export function useRemoteAgentTool<const Name extends string, Result>(
  input: ToolOptionsWithoutInput<Name, Result>,
): Chat.Tool<Name, void, Result>;

/**
 * @public
 */
export function useRemoteAgentTool<const Name extends string, Result>(
  input: ToolOptions<Name, s.HashbrownType, Result>,
): Chat.Tool<Name, any, Result> {
  const acceptsArguments = 'schema' in input;
  const tool = useTool(input as any) as Chat.Tool<Name, any, Result>;

  useRegisterRemoteTool(tool, acceptsArguments);

  return tool;
}
