/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceStatus, signal, type Signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('uiCompletionResource', () => {
  beforeEach(() => {
    structuredCompletionResourceMock.mockReset();
  });

  it('wraps structured completion output with UI metadata', () => {
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
