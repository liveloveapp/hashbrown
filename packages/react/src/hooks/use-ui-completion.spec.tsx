import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { s } from '@hashbrownai/core';
import { useStructuredCompletion } from './use-structured-completion';
import { useUiCompletion } from './use-ui-completion';

vi.mock('./use-structured-completion', () => ({
  useStructuredCompletion: vi.fn(),
}));

const useStructuredCompletionMock = vi.mocked(useStructuredCompletion);

describe('useUiCompletion', () => {
  beforeEach(() => {
    useStructuredCompletionMock.mockReset();
  });

  it('converts structured output into rendered React elements', () => {
    const structuredOutput = {
      ui: [
        {
          $tag: 'TestButton',
          $props: { label: 'Hello' },
          $children: [],
        },
      ],
    };
    useStructuredCompletionMock.mockReturnValue({
      output: structuredOutput,
      reload: vi.fn(),
      error: undefined,
      isLoading: false,
      isReceiving: false,
      isSending: false,
      isGenerating: false,
      isRunningToolCalls: false,
      sendingError: undefined,
      generatingError: undefined,
      exhaustedRetries: false,
      isLoadingThread: false,
      isSavingThread: false,
      threadLoadError: undefined,
      threadSaveError: undefined,
    });

    const TestButton = ({ label }: { label: string }) =>
      createElement('button', null, label);

    const { result } = renderHook(() =>
      useUiCompletion({
        input: 'Generate a UI',
        model: 'gpt-4o-mini',
        system: 'system prompt',
        components: [
          {
            component: TestButton,
            name: 'TestButton',
            description: 'renders a button',
            props: {
              label: s.string('label'),
            },
          },
        ],
      }),
    );

    expect(useStructuredCompletionMock).toHaveBeenCalledTimes(1);
    expect(result.current.output?.content).toEqual(structuredOutput);
    expect(result.current.ui).toHaveLength(1);
    expect(result.current.rawOutput).toEqual(structuredOutput);
  });

  it('returns null output when the structured completion is empty', () => {
    useStructuredCompletionMock.mockReturnValue({
      output: null,
      reload: vi.fn(),
      error: undefined,
      isLoading: false,
      isReceiving: false,
      isSending: false,
      isGenerating: false,
      isRunningToolCalls: false,
      sendingError: undefined,
      generatingError: undefined,
      exhaustedRetries: false,
      isLoadingThread: false,
      isSavingThread: false,
      threadLoadError: undefined,
      threadSaveError: undefined,
    });

    const TestComponent = () => createElement('div', null, 'noop');

    const { result } = renderHook(() =>
      useUiCompletion({
        input: null,
        model: 'gpt-4o-mini',
        system: 'system prompt',
        components: [
          {
            component: TestComponent,
            name: 'TestComponent',
            description: 'noop',
          },
        ],
      }),
    );

    expect(result.current.output).toBeNull();
    expect(result.current.ui).toBeNull();
  });
});
