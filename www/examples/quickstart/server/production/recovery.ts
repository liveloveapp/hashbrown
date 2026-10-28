import type { Message } from '@ag-ui/core';
import { MessageSchema } from '@ag-ui/core/schemas';
import type { Interrupt } from '@hashbrownai/core';

/** Projects only the reference's supported textual root messages, retaining every durable identity. */
export function projectMessages(values: unknown): Message[] {
  if (!Array.isArray(values)) throw new Error('Unsupported history');
  const ids = new Set<string>();
  const calls = new Set<string>();
  return values.map((value) => {
    const raw = value as Record<string, unknown> & {
      _getType?: () => string;
      lc_kwargs?: Record<string, unknown>;
    };
    const data = raw.lc_kwargs ? { ...raw.lc_kwargs, ...raw } : raw;
    const type = raw._getType?.() ?? data.type;
    if (
      typeof data.id !== 'string' ||
      !data.id ||
      ids.has(data.id) ||
      typeof data.content !== 'string'
    )
      throw new Error('Unsupported message identity or content');
    ids.add(data.id);
    if (type === 'human')
      return MessageSchema.parse({
        id: data.id,
        role: 'user',
        content: data.content,
      });
    if (type === 'ai') {
      const toolCalls = (data.tool_calls ?? []) as {
        id?: string;
        name: string;
        args: unknown;
      }[];
      if (
        !Array.isArray(toolCalls) ||
        new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length ||
        (Array.isArray(data.invalid_tool_calls) &&
          data.invalid_tool_calls.length > 0) ||
        toolCalls.some(
          (call) =>
            !call.id || calls.has(call.id) || call.name !== 'acceptPlan',
        )
      )
        throw new Error('Unsupported tool provenance');
      for (const call of toolCalls) calls.add(String(call.id));
      return MessageSchema.parse({
        id: data.id,
        role: 'assistant',
        content: data.content,
        ...(toolCalls.length
          ? {
              toolCalls: toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              })),
            }
          : {}),
      });
    }
    if (
      type === 'tool' &&
      typeof data.tool_call_id === 'string' &&
      calls.has(data.tool_call_id)
    )
      return MessageSchema.parse({
        id: data.id,
        role: 'tool',
        content: data.content,
        toolCallId: data.tool_call_id,
      });
    throw new Error('Unsupported message role');
  });
}

/** Reads complete native permission parks from the same authoritative tuple as message history. */
export function projectInterrupts(writes: readonly unknown[]): Interrupt[] {
  const aliases = new Set<string>();
  return writes.flatMap((write) => {
    if (!Array.isArray(write) || write.length < 3)
      throw new Error('Unsupported pending write');
    if (write[1] === '__error__')
      throw new Error('Unknown interrupted outcome');
    if (write[1] !== '__interrupt__') {
      // These routing channels schedule the paused root tools node; they are not message updates.
      if (
        write[1] === '__pregel_tasks' ||
        String(write[1]).startsWith('branch:')
      )
        return [];
      throw new Error('Unsupported pending state');
    }
    const outerId = write[2]?.id;
    if (typeof outerId !== 'string' || !/^[0-9a-f]{32}$/.test(outerId))
      throw new Error('Malformed native resume key');
    const envelope = write[2]?.value as Record<string, unknown> | undefined;
    if (
      !envelope ||
      typeof envelope.interruptId !== 'string' ||
      !envelope.interruptId ||
      envelope.type !== 'permission-request' ||
      envelope.kind !== 'tool' ||
      typeof envelope.toolCallId !== 'string' ||
      typeof envelope.grant !== 'string' ||
      envelope.allowAlways !== false ||
      envelope.callId
    )
      throw new Error('Unsupported interrupt');
    const currentAliases = new Set([outerId, String(envelope.interruptId)]);
    if ([...currentAliases].some((alias) => aliases.has(alias)))
      throw new Error('Duplicate native interrupt');
    for (const alias of currentAliases) aliases.add(alias);
    return [
      {
        id: envelope.interruptId,
        reason: 'tool',
        toolCallId: envelope.toolCallId,
        metadata: envelope,
        responseSchema: { type: 'string', enum: ['once', 'deny'] },
      },
    ];
  });
}
