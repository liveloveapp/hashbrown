/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ResourceStatus, signal, type Signal } from '@angular/core';
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

const createChatStub = (
  valueSignal: Signal<any[]>,
  status = signal<ResourceStatus>('idle'),
  error = signal<Error | undefined>(undefined),
) => {
  return {
    value: valueSignal,
    status,
    error,
    isLoading: signal(false),
    isSending: signal(false),
    isReceiving: signal(false),
    isGenerating: signal(false),
    isRunningToolCalls: signal(false),
    sendingError: signal<Error | undefined>(undefined),
    generatingError: signal<Error | undefined>(undefined),
    lastAssistantMessage: signal(undefined),
    sendMessage: vi.fn(),
    resendMessages: vi.fn(),
    setMessages: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    hasValue: vi.fn(),
  } as unknown as ReturnType<typeof structuredChatResource>;
};

test('structuredCompletionResource passes reactive options through without exposing persistence state', () => {
  // Arrange
  structuredChatResourceMock.mockReset();
  structuredChatResourceMock.mockReturnValue(createChatStub(signal<any[]>([])));
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/completion');
  const system = signal('System prompt');
  const threadId = signal<string | undefined>('thread-a');

  // Act
  const resource = TestBed.runInInjectionContext(() =>
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
  expect(resource).not.toHaveProperty('isLoadingThread');
  expect(resource).not.toHaveProperty('isSavingThread');
  expect(resource).not.toHaveProperty('threadLoadError');
  expect(resource).not.toHaveProperty('threadSaveError');
  expect(resource).not.toHaveProperty('threadId');

  threadId.set('thread-b');

  const delegatedOptions = structuredChatResourceMock.mock.calls[0]?.[0];
  const delegatedThreadId = delegatedOptions?.threadId as Signal<
    string | undefined
  >;

  expect(delegatedThreadId()).toBe('thread-b');
});

test('structuredCompletionResource preserves a literal empty threadId option', () => {
  structuredChatResourceMock.mockReset();
  structuredChatResourceMock.mockReturnValue(createChatStub(signal<any[]>([])));

  TestBed.runInInjectionContext(() =>
    structuredCompletionResource({
      model: 'gpt-4.1',
      system: 'System prompt',
      threadId: '',
      input: signal('Summarize this'),
      schema: s.object('summary', {
        summary: s.string('Summary'),
      }),
    }),
  );

  expect(structuredChatResourceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('structuredCompletionResource snapshot uses the exposed completion value', () => {
  structuredChatResourceMock.mockReset();
  const completion = { summary: 'Completed response' };
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  structuredChatResourceMock.mockReturnValue(
    createChatStub(
      signal<any[]>([{ role: 'assistant', content: completion }]),
      status,
      error,
    ),
  );

  const resource = TestBed.runInInjectionContext(() =>
    structuredCompletionResource({
      model: 'gpt-4.1',
      system: 'System prompt',
      input: signal('Summarize this'),
      schema: s.object('summary', {
        summary: s.string('Summary'),
      }),
    }),
  );

  expect(resource.value()).toBe(completion);
  expect(resource.status()).toBe(status());
  expect(resource.error()).toBe(error());
  expect(resource.snapshot()).toEqual({
    status: 'resolved',
    value: completion,
  });
});

test.each([
  { label: 'false', output: false },
  { label: 'zero', output: 0 },
  { label: 'an empty string', output: '' },
])('structuredCompletionResource retains $label output', ({ output }) => {
  structuredChatResourceMock.mockReset();
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  structuredChatResourceMock.mockReturnValue(
    createChatStub(
      signal<any[]>([{ role: 'assistant', content: output }]),
      status,
      error,
    ),
  );

  const resource = TestBed.runInInjectionContext(() =>
    structuredCompletionResource({
      model: 'gpt-4.1',
      system: 'System prompt',
      input: signal('Return a falsey value'),
      schema: s.anyOf([
        s.boolean('Boolean output'),
        s.number('Number output'),
        s.string('String output'),
      ]),
    }),
  );

  expect(resource.value()).toBe(output);
  expect(resource.hasValue()).toBe(true);
  expect(resource.snapshot()).toEqual({ status: 'resolved', value: output });
});

test('structuredCompletionResource propagates terminal errors through value', () => {
  structuredChatResourceMock.mockReset();
  const failure = new Error('Structured completion failed');
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  const messages = signal<any[]>([
    { role: 'assistant', content: { summary: 'Completed response' } },
  ]);
  const value = computed(() => {
    if (status() === 'error') {
      throw error();
    }

    return messages();
  });
  structuredChatResourceMock.mockReturnValue(
    createChatStub(value, status, error),
  );
  const resource = TestBed.runInInjectionContext(() =>
    structuredCompletionResource({
      model: 'gpt-4.1',
      system: 'System prompt',
      input: signal('Summarize this'),
      schema: s.object('summary', {
        summary: s.string('Summary'),
      }),
    }),
  );

  error.set(failure);
  status.set('error');

  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});
