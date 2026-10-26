import type { NodeHandler } from './http';

/** The two chat implementations demonstrated by ATC. */
export type ChatBackend = 'openai' | 'b4run';

/** Reads the server-only backend switch; an omitted value preserves OpenAI. */
export function readChatBackend(value: string | undefined): ChatBackend {
  if (value === undefined || value === 'openai') return 'openai';
  if (value === 'b4run') return 'b4run';
  throw new Error('ATC_CHAT_BACKEND must be openai or b4run');
}

/** Constructs only the selected handler; initialization errors never trigger fallback. */
export async function createChatHandler(
  backend: ChatBackend,
  factories: Readonly<
    Record<ChatBackend, () => NodeHandler | Promise<NodeHandler>>
  >,
): Promise<NodeHandler> {
  return factories[backend]();
}
