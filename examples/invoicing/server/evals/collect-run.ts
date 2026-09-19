import type { AgentRunResult } from '@b4run/testing';

/** An AgentRunResult plus the run-level error AG-UI reports, if any. */
export interface InvoicingRunResult extends AgentRunResult {
  readonly error?: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type ToolResult = AgentRunResult['toolResults'][number];

/**
 * A LangChain message as `JSON.stringify` serializes it. B4 streams a tool's
 * `ToolMessage` this way in `TOOL_CALL_RESULT.content`, and `RUN_FINISHED`
 * carries the whole conversation in the same shape.
 */
function serializedMessage(
  value: unknown,
): { type: string; kwargs: Record<string, unknown> } | undefined {
  if (!record(value) || value.lc !== 1 || !record(value.kwargs)) return;
  const id = Array.isArray(value.id) ? value.id.at(-1) : undefined;
  return typeof id === 'string'
    ? { type: id, kwargs: value.kwargs }
    : undefined;
}

const errorShaped = (content: unknown): boolean => {
  if (typeof content !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(content);
    return record(parsed) && typeof parsed.error === 'string';
  } catch {
    return false;
  }
};

/** A tool result from either the streamed frame or a serialized ToolMessage. */
function toolResult(
  name: string,
  content: unknown,
  status?: unknown,
): ToolResult {
  const isError = status === 'error' || errorShaped(content);
  return {
    name,
    content,
    isError,
    ...(isError ? { status: 'error' as const } : {}),
  };
}

function parseFrame(frame: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(frame.slice(5).trim());
    return record(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Parse an AG-UI SSE response into the shape @b4run/evals scorers read. */
export async function collectRun(
  response: Response,
  threadId: string,
): Promise<InvoicingRunResult> {
  const text = await response.text();
  const frames = text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'));
  const events: Record<string, unknown>[] = [];
  let error: string | undefined;
  frames.forEach((frame, index) => {
    const event = parseFrame(frame);
    if (event) events.push(event);
    // A response cut off mid-frame (an aborted stream) leaves a partial LAST
    // event, and everything before it is still a valid run to score. A
    // malformed frame anywhere else is a protocol fault worth reporting.
    else if (index < frames.length - 1) error = 'malformed_frame';
  });

  const calls = new Map<string, { name: string; args: string }>();
  const order: string[] = [];
  const results = new Map<string, ToolResult>();
  const messages: Record<string, unknown>[] = [];
  const texts = new Map<string, string>();
  const tokens: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'TOOL_CALL_START': {
        const id = String(event.toolCallId);
        calls.set(id, { name: String(event.toolCallName), args: '' });
        order.push(id);
        break;
      }
      case 'TOOL_CALL_ARGS': {
        const call = calls.get(String(event.toolCallId));
        const delta = String(event.delta ?? '');
        if (call) call.args += delta;
        // Tool arguments are model output too: the render prose is the
        // whole answer, so a size budget has to count them.
        tokens.push(delta);
        break;
      }
      case 'TOOL_CALL_RESULT': {
        const id = String(event.toolCallId);
        const name = calls.get(id)?.name ?? '';
        let content = event.content;
        let status: unknown;
        // The tool's ToolMessage is streamed serialized; unwrap it so scorers
        // see what the tool returned, as the model does.
        if (typeof content === 'string') {
          try {
            const message = serializedMessage(JSON.parse(content));
            if (message?.type === 'ToolMessage') {
              content = message.kwargs.content;
              status = message.kwargs.status;
            }
          } catch {
            /* plain text result */
          }
        }
        results.set(id, toolResult(name, content, status));
        break;
      }
      case 'TEXT_MESSAGE_START':
        texts.set(String(event.messageId), '');
        break;
      case 'TEXT_MESSAGE_CONTENT': {
        const id = String(event.messageId);
        const delta = String(event.delta ?? '');
        texts.set(id, (texts.get(id) ?? '') + delta);
        tokens.push(delta);
        break;
      }
      case 'TEXT_MESSAGE_END': {
        const id = String(event.messageId);
        messages.push({ id, role: 'assistant', content: texts.get(id) ?? '' });
        break;
      }
      case 'RUN_FINISHED': {
        // A tool that throws produces no TOOL_CALL_RESULT frame at all: B4's
        // adapter drops `on_tool_error`, and LangGraph hands the model an
        // error ToolMessage instead. The run's final message list is the only
        // place that message appears, so results are backfilled from it.
        const messages = record(event.result) ? event.result.messages : [];
        for (const raw of Array.isArray(messages) ? messages : []) {
          const message = serializedMessage(raw);
          if (message?.type !== 'ToolMessage') continue;
          // Only this run's own calls: the list also carries earlier turns.
          const id = String(message.kwargs.tool_call_id ?? '');
          const call = calls.get(id);
          if (!call || results.has(id)) continue;
          results.set(
            id,
            toolResult(
              call.name,
              message.kwargs.content,
              message.kwargs.status,
            ),
          );
        }
        break;
      }
      case 'RUN_ERROR':
        error = String(event.message ?? 'run_error');
        break;
      default:
        break;
    }
  }

  const toolCalls = order.flatMap((id) => {
    const call = calls.get(id);
    if (!call) return [];
    let args: unknown = call.args;
    try {
      args = JSON.parse(call.args || '{}');
    } catch {
      /* keep the raw string */
    }
    return [{ id, name: call.name, args }];
  });
  const toolResults = order.flatMap((id) => results.get(id) ?? []);
  // The last assistant text is the root model's closing `{"ui":[]}`. This
  // relies on the render tool's echo (also streamed as assistant text) arriving
  // before the root model's final turn, which it does because render runs to
  // completion before the model is called again.
  const last = messages.at(-1);
  return {
    finalMessage: typeof last?.content === 'string' ? last.content : '',
    messages,
    toolCalls,
    toolResults,
    tokens,
    state: {},
    threadId,
    interrupts: [],
    planUpdates: [],
    todos: [],
    subagents: [],
    subagentEvents: [],
    systemPrompt: '',
    ...(error !== undefined ? { error } : {}),
  };
}
