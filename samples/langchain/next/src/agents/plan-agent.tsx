import { s } from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Markdown } from '../components/markdown';

/**
 * LangChain serialized message format (lc format)
 * Messages in streams are serialized with this structure
 */
type LangChainSerializedMessage<
  T extends 'AIMessage' | 'ToolMessage' | 'HumanMessage' =
    | 'AIMessage'
    | 'ToolMessage'
    | 'HumanMessage',
> = {
  readonly lc: number;
  readonly type: 'constructor';
  readonly id: readonly ['langchain_core', 'messages', T];
  readonly kwargs: T extends 'AIMessage'
    ? ConstructorParameters<typeof AIMessage>[0]
    : T extends 'ToolMessage'
      ? ConstructorParameters<typeof ToolMessage>[0]
      : T extends 'HumanMessage'
        ? ConstructorParameters<typeof HumanMessage>[0]
        : never;
};

/**
 * Type for serialized AIMessage from stream
 */
type SerializedAIMessage = LangChainSerializedMessage<'AIMessage'>;

/**
 * Type for serialized ToolMessage from stream
 */
type SerializedToolMessage = LangChainSerializedMessage<'ToolMessage'>;

/**
 * Type for serialized HumanMessage from stream
 */
type SerializedHumanMessage = LangChainSerializedMessage<'HumanMessage'>;

/**
 * Union type for all LangChain serialized message types
 */
type LangChainSerializedMessageUnion =
  | SerializedAIMessage
  | SerializedToolMessage
  | SerializedHumanMessage;

/**
 * Stream chunk update event
 */
interface StreamUpdateEvent {
  event: 'update';
  step: 'model_request' | 'tools' | string;
  content: {
    messages?: LangChainSerializedMessageUnion[];
  };
}

/**
 * Stream done event
 */
interface StreamDoneEvent {
  event: 'done';
}

/**
 * Stream error event
 */
interface StreamErrorEvent {
  event: 'error';
  message: string;
}

/**
 * Union type for all stream events
 */
type StreamEvent = StreamUpdateEvent | StreamDoneEvent | StreamErrorEvent;

/**
 * Helper to check if serialized message is AIMessage
 */
function isSerializedAIMessage(
  message: LangChainSerializedMessageUnion,
): message is SerializedAIMessage {
  return (
    message.id[0] === 'langchain_core' &&
    message.id[1] === 'messages' &&
    message.id[2] === 'AIMessage'
  );
}

/**
 * Helper to check if serialized message is ToolMessage
 */
function isSerializedToolMessage(
  message: LangChainSerializedMessageUnion,
): message is SerializedToolMessage {
  return (
    message.id[0] === 'langchain_core' &&
    message.id[1] === 'messages' &&
    message.id[2] === 'ToolMessage'
  );
}

/**
 * Helper to check if serialized message is HumanMessage
 */
function isSerializedHumanMessage(
  message: LangChainSerializedMessageUnion,
): message is SerializedHumanMessage {
  return (
    message.id[0] === 'langchain_core' &&
    message.id[1] === 'messages' &&
    message.id[2] === 'HumanMessage'
  );
}

/**
 * Deserialize a serialized AIMessage to a LangChain AIMessage instance
 */
function deserializeAIMessage(serialized: SerializedAIMessage): AIMessage {
  return new AIMessage(serialized.kwargs);
}

/**
 * Deserialize a serialized ToolMessage to a LangChain ToolMessage instance
 */
function deserializeToolMessage(
  serialized: SerializedToolMessage,
): ToolMessage {
  return new ToolMessage(serialized.kwargs);
}

/**
 * Deserialize a serialized HumanMessage to a LangChain HumanMessage instance
 */
function deserializeHumanMessage(
  serialized: SerializedHumanMessage,
): HumanMessage {
  return new HumanMessage(serialized.kwargs);
}

/**
 * Parse NDJSON chunk buffer and extract complete JSON lines
 */
function parseNDJSONChunk(buffer: string): {
  complete: StreamEvent[];
  remaining: string;
} {
  const lines = buffer.split('\n');
  const complete: StreamEvent[] = [];
  let remaining = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }

    // If this is the last line and buffer might be incomplete, keep it
    if (i === lines.length - 1 && !line.endsWith('}')) {
      remaining = line;
      break;
    }

    try {
      const parsed = JSON.parse(line) as StreamEvent;
      complete.push(parsed);
    } catch {
      // If parsing fails, this might be an incomplete line
      remaining = line;
      break;
    }
  }

  return { complete, remaining };
}

export const usePlanAgent = () => {
  const [threadId] = useState<string>(uuidv4());

  const planAgentTool = useTool({
    name: 'plan',
    description: 'A pilot agent and flight planning expert.',
    handler: async (input: { query: string }, abortSignal: AbortSignal) => {
      const response = await fetch(`http://localhost:3001/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: input.query }],
          thread_id: threadId,
          user_id: 'anon',
        }),
        signal: abortSignal,
      });

      if (!response.body) {
        throw new Error('Response body is not available');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const allEvents: StreamEvent[] = [];

      // Track messages by tool_call_id for matching
      const toolCallResults = new Map<
        string,
        { toolCallId: string; name: string; content: string; status: string }
      >();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Parse complete JSON lines from buffer
          const { complete, remaining } = parseNDJSONChunk(buffer);
          buffer = remaining;

          // Process complete events
          for (const event of complete) {
            allEvents.push(event);

            if (event.event === 'update') {
              console.log('Stream chunk:', JSON.stringify(event, null, 2));

              // Process messages in the update
              if (event.content.messages) {
                for (const message of event.content.messages) {
                  if (isSerializedAIMessage(message)) {
                    // Deserialize to LangChain AIMessage instance
                    const aiMessage = deserializeAIMessage(message);
                    const toolCalls = aiMessage.tool_calls ?? [];
                    console.log(
                      `AIMessage with ${toolCalls.length} tool calls:`,
                      toolCalls.map((tc) => ({
                        id: tc.id,
                        name: tc.name,
                        args: tc.args,
                      })),
                    );
                  } else if (isSerializedToolMessage(message)) {
                    // Deserialize to LangChain ToolMessage instance
                    const toolMessage = deserializeToolMessage(message);
                    const toolResult = {
                      toolCallId: toolMessage.tool_call_id,
                      name: toolMessage.name ?? 'unknown',
                      content:
                        typeof toolMessage.content === 'string'
                          ? toolMessage.content
                          : JSON.stringify(toolMessage.content),
                      status: 'success', // ToolMessage doesn't have status, assume success
                    };
                    toolCallResults.set(toolMessage.tool_call_id, toolResult);
                    console.log(
                      `ToolMessage received: ${toolMessage.name ?? 'unknown'} (${toolMessage.tool_call_id})`,
                    );
                  } else if (isSerializedHumanMessage(message)) {
                    // Deserialize to LangChain HumanMessage instance
                    const humanMessage = deserializeHumanMessage(message);
                    console.log(
                      'HumanMessage:',
                      typeof humanMessage.content === 'string'
                        ? humanMessage.content
                        : JSON.stringify(humanMessage.content),
                    );
                  }
                }
              }
            } else if (event.event === 'done') {
              console.log('Stream complete');
            } else if (event.event === 'error') {
              console.error('Stream error:', event.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // For now, return the accumulated content as string
      // This could be enhanced to return structured data
      const finalContent = allEvents
        .filter(
          (e): e is StreamUpdateEvent =>
            e.event === 'update' && e.step === 'model_request',
        )
        .map((e) => {
          const messages = e.content.messages ?? [];
          return messages
            .map((m) => {
              if (isSerializedAIMessage(m)) {
                const aiMessage = deserializeAIMessage(m);
                return typeof aiMessage.content === 'string'
                  ? aiMessage.content
                  : JSON.stringify(aiMessage.content);
              }
              if (isSerializedToolMessage(m)) {
                const toolMessage = deserializeToolMessage(m);
                return typeof toolMessage.content === 'string'
                  ? toolMessage.content
                  : JSON.stringify(toolMessage.content);
              }
              if (isSerializedHumanMessage(m)) {
                const humanMessage = deserializeHumanMessage(m);
                return typeof humanMessage.content === 'string'
                  ? humanMessage.content
                  : JSON.stringify(humanMessage.content);
              }
              return '';
            })
            .filter(Boolean)
            .join('\n');
        })
        .join('\n');

      console.log('All stream events:', allEvents.length);
      return finalContent || 'No content received';
    },
    deps: [threadId],
    schema: s.object('Plan agent input', {
      query: s.string('The query to plan a flight'),
    }),
  });

  const exposedMarkdown = exposeComponent(Markdown, {
    name: 'Markdown',
    description: 'Show markdown to the user',
    children: 'text' as const,
  });

  const agent = useUiChat({
    model: 'gpt-4.1',
    debugName: 'plan-agent',
    system: 'You are a pilot agent and flight planning expert.',
    tools: [planAgentTool],
    components: [exposedMarkdown],
  });

  return { agent };
};
