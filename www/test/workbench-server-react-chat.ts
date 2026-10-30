import { vi } from 'vitest';

/** A mocked idle `useChat` result with spied actions. */
export function idleChat() {
  return {
    messages: [],
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    pendingInterrupts: undefined,
    error: undefined,
    lastRunFinishReason: undefined,
    recovery: { required: false },
    stop: vi.fn(),
    setMessages: vi.fn(),
    sendMessage: vi.fn(),
  };
}

/** A single-conversation workbench navigation with spied actions. */
export function navigation() {
  return {
    currentId: '1',
    conversations: [{ id: '1', label: 'Plan' }],
    select: vi.fn(),
    create: vi.fn(),
  };
}
