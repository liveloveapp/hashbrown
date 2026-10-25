import type { RunAgentInput } from '@ag-ui/core';
import { cloneAndFreezeOptionalJsonValue } from '../utils/json-value';
import { readHashbrownExtension } from './hashbrown-run-agent-input';
import { TransportError } from './transport-error';

/** Canonical typed tool content owned by this adapter. @internal */
export interface ChromeToolValue {
  callId: string;
  name: string;
  arguments?: object;
  result?: { type: 'text'; value: string }[];
  errorMessage?: string;
}
/** Serializable native prompt before browser constructors are applied. @internal */
export interface ChromeToolMessage {
  role: 'system' | 'assistant' | 'user';
  content:
    | string
    | {
        type: 'text' | 'tool-call' | 'tool-response';
        value: string | ChromeToolValue;
      }[];
}
/** Rejects unsupported native tool requests without a provider fallback. @internal */
export function chromeToolError(message: string): TransportError {
  return new TransportError(message, {
    code: 'FEATURE_UNSUPPORTED',
    retryable: false,
  });
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}
/** Clones and bounds JSON objects crossing the native tools boundary. @internal */
export function chromeToolObject(value: unknown): object {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    const clone = cloneAndFreezeOptionalJsonValue(value);
    if (new TextEncoder().encode(JSON.stringify(clone)).length > 1024 * 1024)
      throw new Error();
    return clone as object;
  } catch {
    throw chromeToolError(
      'Native tool arguments must be bounded JSON objects.',
    );
  }
}
/** Validates a complete native turn before exposing any executable call. @internal */
export function validateChromeToolCalls(
  values: readonly unknown[],
  names: readonly string[],
  historyIds: readonly string[],
): ChromeToolValue[] {
  if (values.length > 64)
    throw chromeToolError('Native turn exceeds 64 tool calls.');
  const ids = new Set(historyIds);
  return values.map((value) => {
    if (!value || typeof value !== 'object')
      throw chromeToolError('Malformed native call.');
    const call = value as Record<string, unknown>;
    const raw = 'callID' in call ? call['callID'] : call['callId'];
    if (
      'callID' in call &&
      'callId' in call &&
      call['callID'] !== call['callId']
    )
      throw chromeToolError('Conflicting native call identifiers.');
    const callId =
      raw === '' && values.length === 1 ? globalThis.crypto.randomUUID() : raw;
    if (!identifier(callId) || ids.has(callId))
      throw chromeToolError('Invalid or duplicate native call identifier.');
    ids.add(callId);
    if (typeof call['name'] !== 'string' || !names.includes(call['name']))
      throw chromeToolError('Unknown native tool name.');
    return {
      callId,
      name: call['name'],
      arguments: chromeToolObject(call['arguments']),
    };
  });
}
/** Validates and owns serializable native declarations at every public boundary. @internal */
export function prepareChromeToolDeclarations(
  declarations: readonly {
    name: string;
    description: string;
    parameters?: unknown;
  }[],
) {
  const tools = declarations.map((tool) => {
    if (
      !identifier(tool.name) ||
      typeof tool.description !== 'string' ||
      !tool.description.trim()
    )
      throw chromeToolError('Invalid tool declaration.');
    const schema = chromeToolObject(tool.parameters);
    if ((schema as { type?: unknown }).type !== 'object')
      throw chromeToolError('Tool schemas must declare an object.');
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: schema,
    };
  });
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length)
    throw chromeToolError('Duplicate tool declarations.');
  return Object.freeze(tools.map((tool) => Object.freeze(tool)));
}
/** Translates authoritative canonical history without mutating it. @internal */
export function prepareChromeToolMessages(
  input: RunAgentInput,
  schemaFinalization = false,
) {
  const extension = readHashbrownExtension(input);
  if (
    (!schemaFinalization && extension?.responseSchema !== undefined) ||
    extension?.ui
  )
    throw chromeToolError(
      'Native tools do not support structured output or UI composition.',
    );
  const responseSchema =
    extension?.responseSchema === undefined
      ? undefined
      : chromeToolObject(extension.responseSchema);
  const tools = prepareChromeToolDeclarations(input.tools);
  const calls = new Map<string, string>();
  const results = new Set<string>();
  const messages: ChromeToolMessage[] = [];
  for (const message of input.messages) {
    if (message.role === 'tool') {
      const name = calls.get(message.toolCallId);
      if (
        !name ||
        results.has(message.toolCallId) ||
        typeof message.content !== 'string'
      )
        throw chromeToolError('Orphan, duplicate, or invalid tool result.');
      results.add(message.toolCallId);
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool-response',
            value: {
              callId: message.toolCallId,
              name,
              ...(message.error !== undefined
                ? { errorMessage: message.content }
                : { result: [{ type: 'text', value: message.content }] }),
            },
          },
        ],
      });
      continue;
    }
    if (!['system', 'developer', 'assistant', 'user'].includes(message.role))
      throw chromeToolError('Unsupported native tools message role.');
    if (message.content !== undefined && typeof message.content !== 'string')
      throw chromeToolError('Native tools require text-only messages.');
    const content: Exclude<ChromeToolMessage['content'], string> = [];
    if (typeof message.content === 'string' && message.content.length)
      content.push({ type: 'text', value: message.content });
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) {
        let args: unknown;
        if (
          typeof call.function.arguments !== 'string' ||
          new TextEncoder().encode(call.function.arguments).length > 1024 * 1024
        )
          throw chromeToolError(
            'History tool arguments exceed the JSON bound.',
          );
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          throw chromeToolError('Malformed history tool arguments.');
        }
        const [validated] = validateChromeToolCalls(
          [{ callId: call.id, name: call.function.name, arguments: args }],
          tools.map((tool) => tool.name),
          [...calls.keys()],
        );
        if (!identifier(call.id))
          throw chromeToolError('History IDs must be canonical.');
        calls.set(validated.callId, validated.name);
        content.push({ type: 'tool-call', value: validated });
      }
    }
    messages.push({
      role:
        message.role === 'developer'
          ? 'system'
          : (message.role as ChromeToolMessage['role']),
      content: content.some((part) => part.type !== 'text')
        ? content
        : (message.content ?? ''),
    });
  }
  if (results.size !== calls.size)
    throw chromeToolError('Unresolved history tool calls.');
  return { messages, tools, historyIds: [...calls.keys()], responseSchema };
}
