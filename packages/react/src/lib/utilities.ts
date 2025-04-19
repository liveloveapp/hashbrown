import { Chat } from '@hashbrownai/core';
import { BoundTool } from './create-tool.fn';
import { s } from './schema';

/**
 * Creates OpenAI tool definitions from the provided tools.
 *
 * @param tools - The list of tools from configuration.
 * @returns An array of tool definitions for the chat completion.
 */
export function createToolDefinitions(
  tools: BoundTool<string, s.ObjectType<Record<string, s.AnyType>>>[] = [],
): Chat.Tool[] {
  return tools.map((boundTool): Chat.Tool => boundTool.toTool());
}
