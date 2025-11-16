import { Chat } from '@hashbrownai/core';
import { type DependencyList, useMemo } from 'react';

/**
 * Creates a group of tools dynamically using a callback function.
 *
 * This hook is simple sugar over useMemo that allows you to create dynamic lists
 * of tools without calling hooks conditionally. This is particularly useful for MCP
 * (Model Context Protocol) in React where you need to create dynamic tool lists.
 *
 * @public
 * @typeParam Tools - The type of tools in the group
 * @param callback - A function that returns an array of tool objects
 * @param deps - Dependencies that should trigger tool group recreation
 * @returns An array of tools
 *
 * @example
 * Basic usage with dynamic tools:
 * ```tsx
 * const tools = useToolGroup(() => {
 *   const tools = [];
 *   if (condition) {
 *     tools.push(tool1);
 *   }
 *   if (otherCondition) {
 *     tools.push(tool2);
 *   }
 *   return tools;
 * }, [condition, otherCondition]);
 * ```
 *
 * @example
 * Usage with useTool:
 * ```tsx
 * const calculateTool = useTool({
 *   name: 'calculate',
 *   description: 'Performs calculations',
 *   schema: s.object('input', { expression: s.string() }),
 *   handler: async (input) => eval(input.expression),
 *   deps: [],
 * });
 *
 * const searchTool = useTool({
 *   name: 'search',
 *   description: 'Searches the web',
 *   schema: s.object('input', { query: s.string() }),
 *   handler: async (input) => searchWeb(input.query),
 *   deps: [],
 * });
 *
 * const tools = useToolGroup(() => {
 *   const tools = [calculateTool];
 *   if (userHasPermission) {
 *     tools.push(searchTool);
 *   }
 *   return tools;
 * }, [userHasPermission, calculateTool, searchTool]);
 * ```
 */
export function useToolGroup<Tools extends Chat.AnyTool>(
  callback: () => Tools[],
  deps: DependencyList,
): Tools[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(callback, deps);
}
