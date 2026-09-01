/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ResourceStatus, signal, type Signal } from '@angular/core';
import { s } from '@hashbrownai/core';
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

const createCompletionStub = (
  valueSignal: Signal<any | null>,
  status = signal<ResourceStatus>('idle'),
  error = signal<Error | undefined>(undefined),
) => {
  return {
    value: valueSignal,
    status,
    error,
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
    apiUrl,
    system,
    threadId,
  });

  // Assert
  const delegatedOptions = structuredCompletionResourceMock.mock.calls[0]?.[0];
  const delegatedSystem = delegatedOptions?.system as Signal<string>;

  expect(delegatedOptions).toEqual(
    expect.objectContaining({
      apiUrl,
      threadId,
    }),
  );
  expect(delegatedSystem).not.toBe(system);
  expect(delegatedSystem()).toBe('System prompt');

  system.set('Updated system prompt');

  expect(delegatedSystem()).toBe('Updated system prompt');
});

test('uiCompletionResource snapshot uses the exposed assistant message', () => {
  structuredCompletionResourceMock.mockReset();
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  structuredCompletionResourceMock.mockReturnValue(
    createCompletionStub(signal({ ui: [] }), status, error),
  );

  const resource = uiCompletionResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    input: signal('Describe a component'),
    system: 'System prompt',
  });

  expect(resource.status()).toBe(status());
  expect(resource.error()).toBe(error());
  expect(resource.snapshot()).toEqual({
    status: 'resolved',
    value: resource.value(),
  });
  expect(resource.snapshot()).toEqual({
    status: 'resolved',
    value: expect.objectContaining({ role: 'assistant', toolCalls: [] }),
  });
});

test('uiCompletionResource propagates terminal errors through value', () => {
  structuredCompletionResourceMock.mockReset();
  const failure = new Error('UI completion failed');
  const status = signal<ResourceStatus>('resolved');
  const error = signal<Error | undefined>(undefined);
  const completionValue = signal<any | null>({ ui: [] });
  const value = computed(() => {
    if (status() === 'error') {
      throw error();
    }

    return completionValue();
  });
  structuredCompletionResourceMock.mockReturnValue(
    createCompletionStub(value, status, error),
  );
  const resource = uiCompletionResource({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
    input: signal('Describe a component'),
    system: 'System prompt',
  });

  error.set(failure);
  status.set('error');

  expect(resource.snapshot()).toEqual({ status: 'error', error: failure });
  expect(() => resource.value()).toThrow(failure);
});
