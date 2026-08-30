import { type ReasoningMessage } from '@ag-ui/core';
import {
  type AnyTool,
  type AssistantMessage as ViewAssistantMessage,
} from './view.models';
import {
  toApiMessagesFromInternal,
  toInternalMessagesFromApi,
  toInternalMessagesFromView,
  toViewMessagesFromInternal,
} from './internal_helpers';

function viewAssistant(
  reasoning?: string,
  reasoningDetails?: readonly Readonly<ReasoningMessage>[],
): ViewAssistantMessage<string, AnyTool> {
  return {
    role: 'assistant',
    content: 'answer',
    toolCalls: [],
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
  };
}

test('hydrates visible reasoning from details and isolates nested metadata', () => {
  // Arrange
  const metadata = { nested: { value: 'original' } };
  const message = viewAssistant('stale display reasoning', [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      metadata,
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque',
    },
    {
      id: 'r-3',
      role: 'reasoning',
      content: 'step two',
    },
  ]);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  metadata.nested.value = 'mutated';
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(
    viewAssistant('step one\n\nstep two', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'original' } },
      },
      {
        id: 'r-2',
        role: 'reasoning',
        content: '',
        encryptedValue: 'opaque',
      },
      {
        id: 'r-3',
        role: 'reasoning',
        content: 'step two',
      },
    ]),
  );
});

test('preserves display-only empty reasoning as an own property', () => {
  // Arrange
  const message = viewAssistant('');

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(''));
  expect(Object.hasOwn(view, 'reasoning')).toBe(true);
  expect((view as ViewAssistantMessage<string, AnyTool>).reasoning).toBe('');
  expect(view).not.toHaveProperty('reasoningDetails');
});

test('round-trips complete ordered reasoning details through API messages', () => {
  // Arrange
  const details: readonly Readonly<ReasoningMessage>[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      encryptedValue: 'opaque',
      subagentRunId: 'subagent-1',
      metadata: {
        continuation: {
          cursor: 'cursor-1',
          checkpoints: [
            { token: 'checkpoint-1' },
            { token: 'checkpoint-2', state: { complete: false } },
          ],
        },
      },
    },
  ];
  const message = viewAssistant('stale display reasoning', details);
  const [internal] = toInternalMessagesFromView(message);

  // Act
  const [api] = toApiMessagesFromInternal(internal, []);
  const [roundTrippedInternal] = toInternalMessagesFromApi(api);
  const [view] = toViewMessagesFromInternal(roundTrippedInternal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant('step one', details));
});

test('preserves all-opaque reasoning details without visible reasoning', () => {
  // Arrange
  const details: readonly Readonly<ReasoningMessage>[] = [
    {
      id: 'r-1',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque-1',
    },
    {
      id: 'r-2',
      role: 'reasoning',
      content: '',
      encryptedValue: 'opaque-2',
      subagentRunId: 'subagent-2',
    },
  ];
  const message = viewAssistant('stale display reasoning', details);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(undefined, details));
  expect(view).not.toHaveProperty('reasoning');
});

test('prefers empty reasoning details over stale display reasoning', () => {
  // Arrange
  const message = viewAssistant('stale display reasoning', []);

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(view).toEqual(viewAssistant(undefined, []));
  expect(view).not.toHaveProperty('reasoning');
});

test('isolates reasoning details at view, API, and internal boundaries', () => {
  // Arrange
  const message = viewAssistant(undefined, [
    {
      id: 'r-1',
      role: 'reasoning',
      content: 'step one',
      metadata: { nested: { value: 'original' } },
    },
  ]);
  const [internal] = toInternalMessagesFromView(message);
  const [api] = toApiMessagesFromInternal(internal, []);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Act
  const viewDetail = message.reasoningDetails?.[0];
  const apiDetail =
    api.role === 'assistant' ? api.reasoningDetails?.[0] : undefined;
  const viewMetadata = viewDetail?.metadata?.['nested'] as { value: string };
  const apiMetadata = apiDetail?.metadata?.['nested'] as { value: string };
  viewMetadata.value = 'view mutation';
  apiMetadata.value = 'API mutation';
  const [rehydratedInternal] = toInternalMessagesFromApi(api);
  apiMetadata.value = 'second API mutation';
  const [rehydratedView] = toViewMessagesFromInternal(
    rehydratedInternal,
    {},
    [],
  );

  // Assert
  expect(view).toEqual(
    viewAssistant('step one', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'original' } },
      },
    ]),
  );
  expect(rehydratedView).toEqual(
    viewAssistant('step one', [
      {
        id: 'r-1',
        role: 'reasoning',
        content: 'step one',
        metadata: { nested: { value: 'API mutation' } },
      },
    ]),
  );
});

test('omits reasoning fields when they are absent', () => {
  // Arrange
  const message = viewAssistant();

  // Act
  const [internal] = toInternalMessagesFromView(message);
  const [api] = toApiMessagesFromInternal(internal, []);
  const [view] = toViewMessagesFromInternal(internal, {}, []);

  // Assert
  expect(api).not.toHaveProperty('reasoning');
  expect(api).not.toHaveProperty('reasoningDetails');
  expect(view).not.toHaveProperty('reasoning');
  expect(view).not.toHaveProperty('reasoningDetails');
});
