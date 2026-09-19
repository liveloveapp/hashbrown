import type { AgentRunResult } from '@b4run/testing';

/** An AgentRunResult plus the run-level error AG-UI reports, if any. */
export interface InvoicingRunResult extends AgentRunResult {
  readonly error?: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse an AG-UI SSE response into the shape @b4run/evals scorers read. */
export async function collectRun(
  response: Response,
  threadId: string,
): Promise<InvoicingRunResult> {
  const text = await response.text();
  const events = text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map(
      (frame) => JSON.parse(frame.slice(5).trim()) as Record<string, unknown>,
    );

  const calls = new Map<string, { name: string; args: string }>();
  const order: string[] = [];
  const toolResults: AgentRunResult['toolResults'][number][] = [];
  const messages: Record<string, unknown>[] = [];
  const texts = new Map<string, string>();
  const tokens: string[] = [];
  let error: string | undefined;

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
        if (call) call.args += String(event.delta ?? '');
        break;
      }
      case 'TOOL_CALL_RESULT': {
        const call = calls.get(String(event.toolCallId));
        const content = event.content;
        let isError = false;
        if (typeof content === 'string') {
          try {
            const parsed: unknown = JSON.parse(content);
            isError = record(parsed) && typeof parsed.error === 'string';
          } catch {
            isError = false;
          }
        }
        toolResults.push({
          name: call?.name ?? '',
          content,
          isError,
          ...(isError ? { status: 'error' as const } : {}),
        });
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
      case 'RUN_ERROR':
        error = String(event.message ?? 'run_error');
        break;
      default:
        break;
    }
  }

  const toolCalls = order.map((id) => {
    const call = calls.get(id);
    let args: unknown = call?.args ?? '';
    try {
      args = JSON.parse(call?.args || '{}');
    } catch {
      /* keep the raw string */
    }
    return { id, name: call?.name ?? '', args };
  });
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
