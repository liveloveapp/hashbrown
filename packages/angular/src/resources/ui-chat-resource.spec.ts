/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ResourceStatus, signal, type Signal } from '@angular/core';
import { type ModelInput, s } from '@hashbrownai/core';
import { vi } from 'vitest';
import { uiChatResource } from './ui-chat-resource.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils';
import { createUiKit } from '../utils/ui-kit.fn';

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
    sendMessage: vi.fn(),
    resendMessages: vi.fn(),
    setMessages: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    hasValue: vi.fn(),
  } as unknown as ReturnType<typeof structuredChatResource>;
};

test('uiChatResource accepts UiKit inputs and decorates assistant messages', () => {
  // Arrange
  const messagesSignal = signal<any[]>([]);
  structuredChatResourceMock.mockReturnValue(createChatStub(messagesSignal));

  class CardComponent {}

  const uiKit = createUiKit({
    components: [
      {
        component: CardComponent,
        name: 'Card',
        description: 'Card component',
        props: {
          label: s.string('label'),
        },
      },
    ],
  });

  const resource = uiChatResource({
    components: [uiKit],
    model: 'gpt-4o-mini',
    system: 'system prompt',
  });

  // Act
  messagesSignal.set([
    {
      role: 'assistant',
      content: {
        ui: [
          {
            Card: {
              props: {
                complete: true,
                partialValue: { label: 'Hello' },
                value: { label: 'Hello' },
              },
            },
          },
        ],
      },
      toolCalls: [],
    },
  ]);

  const message = resource.value()[0];

  // Assert
  expect(message.role).toBe('assistant');
  expect((message as any)[TAG_NAME_REGISTRY].Card.component).toBe(
    CardComponent,
  );
});

test('uiChatResource provides empty tag registry when assistant has no content', () => {
  // Arrange
  const messagesSignal = signal<any[]>([]);
  structuredChatResourceMock.mockReturnValue(createChatStub(messagesSignal));

  const resource = uiChatResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    model: 'gpt-4o-mini',
    system: 'system prompt',
  });

  // Act
  messagesSignal.set([
    {
      role: 'assistant',
      content: undefined,
      toolCalls: [],
    },
  ]);

  const message = resource.value()[0];

  // Assert
  expect((message as any)[TAG_NAME_REGISTRY]).toEqual({});
});

test('uiChatResource passes reactive options through without exposing persistence state', () => {
  // Arrange
  structuredChatResourceMock.mockReset();
  structuredChatResourceMock.mockReturnValue(createChatStub(signal<any[]>([])));
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/ui-chat');
  const system = signal('System prompt');
  const threadId = signal<string | undefined>('thread-a');

  // Act
  const resource = uiChatResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    model,
    apiUrl,
    system,
    threadId,
  });

  // Assert
  const delegatedOptions = structuredChatResourceMock.mock.calls[0]?.[0];
  const delegatedSystem = delegatedOptions?.system as Signal<string>;

  expect(delegatedOptions).toEqual(
    expect.objectContaining({
      model,
      apiUrl,
      threadId,
    }),
  );
  expect(delegatedSystem).not.toBe(system);
  expect(delegatedSystem()).toBe('System prompt');
  expect(resource).not.toHaveProperty('isLoadingThread');
  expect(resource).not.toHaveProperty('isSavingThread');
  expect(resource).not.toHaveProperty('threadLoadError');
  expect(resource).not.toHaveProperty('threadSaveError');
  expect(resource).not.toHaveProperty('threadId');

  system.set('Updated system prompt');
  threadId.set('thread-b');

  expect(delegatedSystem()).toBe('Updated system prompt');
  expect((delegatedOptions?.threadId as Signal<string | undefined>)()).toBe(
    'thread-b',
  );
});

test('uiChatResource preserves a literal empty threadId option', () => {
  structuredChatResourceMock.mockReset();
  structuredChatResourceMock.mockReturnValue(createChatStub(signal<any[]>([])));

  uiChatResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    model: 'gpt-4.1',
    system: 'System prompt',
    threadId: '',
  });

  expect(structuredChatResourceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      threadId: '',
    }),
  );
});

test('uiChatResource snapshot uses the exposed decorated messages', () => {
  structuredChatResourceMock.mockReset();
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  const messages = signal<any[]>([
    {
      role: 'assistant',
      content: { ui: [] },
      toolCalls: [],
    },
  ]);
  structuredChatResourceMock.mockReturnValue(
    createChatStub(messages, status, error),
  );

  const resource = uiChatResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    model: 'gpt-4.1',
    system: 'System prompt',
  });

  expect(resource.status()).toBe(status());
  expect(resource.error()).toBe(error());
  expect(resource.snapshot()).toEqual({
    status: 'resolved',
    value: resource.value(),
  });
  expect(
    (resource.snapshot() as { value: any[] }).value[0][TAG_NAME_REGISTRY],
  ).toBeDefined();
});

test('uiChatResource propagates terminal errors through value', () => {
  structuredChatResourceMock.mockReset();
  const failure = new Error('UI chat failed');
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  const messages = signal<any[]>([
    {
      role: 'assistant',
      content: { ui: [] },
      toolCalls: [],
    },
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
  const resource = uiChatResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    model: 'gpt-4.1',
    system: 'System prompt',
  });

  error.set(failure);
  status.set('error');

  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});
