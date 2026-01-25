/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceStatus, signal, type Signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { vi } from 'vitest';
import { uiChatResource } from './ui-chat-resource.fn';
import { structuredChatResource } from './structured-chat-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils';
import { createUiKit } from '../utils/ui-kit.fn';

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
              children: [],
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
