/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceStatus, signal, type Signal } from '@angular/core';
import { type ModelInput, s } from '@hashbrownai/core';
import { vi } from 'vitest';
import { uiCompletionResource } from './ui-completion-resource.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils';
import { createUiKit } from '../utils/ui-kit.fn';

vi.mock('./structured-completion-resource.fn', () => ({
  structuredCompletionResource: vi.fn(),
}));

const structuredCompletionResourceMock = vi.mocked(
  structuredCompletionResource,
);

const createCompletionStub = (valueSignal: Signal<any | null>) => {
  return {
    value: valueSignal,
    status: signal<ResourceStatus>('idle'),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    reload: vi.fn(),
    stop: vi.fn(),
    isSending: signal(false),
    isReceiving: signal(false),
    hasValue: vi.fn(),
  } as ReturnType<typeof structuredCompletionResource>;
};

test('uiCompletionResource wraps structured completion output with UI metadata', () => {
  // Arrange
  structuredCompletionResourceMock.mockReset();

  const completionValue = signal<any | null>(null);
  structuredCompletionResourceMock.mockReturnValue(
    createCompletionStub(completionValue),
  );

  class TestComponent {}

  const resource = uiCompletionResource({
    components: [
      {
        component: TestComponent,
        name: 'TestComponent',
        description: 'test',
        props: {
          label: s.string('label'),
        },
      },
    ],
    input: signal('Describe a component'),
    model: 'gpt-4o-mini',
    system: 'system prompt',
  });

  // Act
  completionValue.set({
    ui: [
      {
        TestComponent: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
          },
        },
      },
    ],
  });

  const message = resource.value();

  // Assert
  expect(message?.role).toBe('assistant');
  expect(message?.content).toEqual({
    ui: [
      {
        TestComponent: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
          },
        },
      },
    ],
  });
  expect(message?.toolCalls).toEqual([]);
  expect(message?.[TAG_NAME_REGISTRY]?.TestComponent?.component).toBe(
    TestComponent,
  );
});

test('uiCompletionResource accepts UiKit inputs', () => {
  // Arrange
  structuredCompletionResourceMock.mockReset();

  const completionValue = signal<any | null>(null);
  structuredCompletionResourceMock.mockReturnValue(
    createCompletionStub(completionValue),
  );

  class TileComponent {}

  const uiKit = createUiKit({
    components: [
      {
        component: TileComponent,
        name: 'Tile',
        description: 'Tile component',
      },
    ],
  });

  const resource = uiCompletionResource({
    components: [uiKit],
    input: signal('Describe a component'),
    model: 'gpt-4o-mini',
    system: 'system prompt',
  });

  // Act
  completionValue.set({
    ui: [
      {
        Tile: {
          props: {
            complete: true,
            partialValue: {},
            value: {},
          },
        },
      },
    ],
  });

  const message = resource.value();

  // Assert
  expect(message?.[TAG_NAME_REGISTRY]?.Tile?.component).toBe(TileComponent);
});

test('uiCompletionResource passes reactive options through to structuredCompletionResource', () => {
  // Arrange
  structuredCompletionResourceMock.mockReset();
  structuredCompletionResourceMock.mockReturnValue(
    createCompletionStub(signal<any | null>(null)),
  );
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/ui-completion');
  const system = signal('System prompt');
  const threadId = signal<string | undefined>('thread-a');

  // Act
  uiCompletionResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    input: signal('Describe a component'),
    model,
    apiUrl,
    system,
    threadId,
  });

  // Assert
  const delegatedOptions = structuredCompletionResourceMock.mock.calls[0]?.[0];
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

  system.set('Updated system prompt');

  expect(delegatedSystem()).toBe('Updated system prompt');
});
