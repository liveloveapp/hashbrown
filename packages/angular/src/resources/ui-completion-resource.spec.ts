/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceStatus, signal, type Signal } from '@angular/core';
import { s } from '@hashbrownai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uiCompletionResource } from './ui-completion-resource.fn';
import { structuredCompletionResource } from './structured-completion-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils';

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
          $tag: 'TestComponent',
          $props: { label: 'Hello' },
          $children: [],
        },
      ],
    });

    const message = resource.value();

    expect(message?.role).toBe('assistant');
    expect(message?.content).toEqual({
      ui: [
        {
          $tag: 'TestComponent',
          $props: { label: 'Hello' },
          $children: [],
        },
      ],
    });
    expect(message?.toolCalls).toEqual([]);
    expect(message?.[TAG_NAME_REGISTRY]?.TestComponent?.component).toBe(
      TestComponent,
    );
  });
});
