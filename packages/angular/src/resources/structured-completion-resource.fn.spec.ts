/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceStatus, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ModelInput } from '@hashbrownai/core';
import { s } from '@hashbrownai/core';
import { vi } from 'vitest';
import { structuredChatResource } from './structured-chat-resource.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';

vi.mock('./structured-chat-resource.fn', () => ({
  structuredChatResource: vi.fn(),
}));

const structuredChatResourceMock = vi.mocked(structuredChatResource);

const createChatStub = (valueSignal: Signal<any[]>) => {
  return {
    value: valueSignal,
    status: signal<ResourceStatus>('idle'),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    isSending: signal(false),
    isReceiving: signal(false),
    isGenerating: signal(false),
    isRunningToolCalls: signal(false),
    isLoadingThread: signal(false),
    isSavingThread: signal(false),
    sendingError: signal<Error | undefined>(undefined),
    generatingError: signal<Error | undefined>(undefined),
    threadLoadError: signal<{ error: string; stacktrace?: string } | undefined>(
      undefined,
    ),
    threadSaveError: signal<{ error: string; stacktrace?: string } | undefined>(
      undefined,
    ),
    lastAssistantMessage: signal(undefined),
    sendMessage: vi.fn(),
    resendMessages: vi.fn(),
    setMessages: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    hasValue: vi.fn(),
  } as unknown as ReturnType<typeof structuredChatResource>;
};

test('structuredCompletionResource passes reactive options through to structuredChatResource', () => {
  // Arrange
  structuredChatResourceMock.mockReset();
  structuredChatResourceMock.mockReturnValue(createChatStub(signal<any[]>([])));
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/completion');
  const system = signal('System prompt');
  const threadId = signal<string | undefined>('thread-a');

  // Act
  TestBed.runInInjectionContext(() =>
    structuredCompletionResource({
      model,
      apiUrl,
      system,
      threadId,
      input: signal('Summarize this'),
      schema: s.object('summary', {
        summary: s.string('Summary'),
      }),
    }),
  );

  // Assert
  expect(structuredChatResourceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model,
      apiUrl,
      system,
      threadId,
    }),
  );
});
