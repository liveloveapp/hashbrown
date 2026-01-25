import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { s, ɵcreateUiKit, ɵisUiKit } from '@hashbrownai/core';
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
          TestButton: {
            props: {
              complete: true,
              partialValue: { label: 'Hello' },
              value: { label: 'Hello' },
            },
            children: [],
          },
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

  it('renders fallbacks when props are still streaming', () => {
    const structuredOutput = {
      ui: [
        {
          TestButton: {
            props: {
              complete: false,
              partialValue: { label: 'Hel' },
            },
          },
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
    const TestButtonFallback = ({
      tag,
      partialProps,
    }: {
      tag: string;
      partialProps?: Record<string, unknown>;
    }) =>
      createElement(
        'span',
        null,
        `${tag}:${partialProps?.label ?? ''}`,
      );

    const { result } = renderHook(() =>
      useUiCompletion({
        input: 'Generate a UI',
        model: 'gpt-4o-mini',
        system: 'system prompt',
        components: [
          {
            component: TestButton,
            fallback: TestButtonFallback,
            name: 'TestButton',
            description: 'renders a button',
            props: {
              label: s.string('label'),
            },
          },
        ],
      }),
    );

    expect(result.current.ui).toHaveLength(1);
    expect(result.current.ui?.[0].type).toBe(TestButtonFallback);
    expect(result.current.ui?.[0].props).toEqual({
      tag: 'TestButton',
      partialProps: { label: 'Hel' },
    });
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

test('useUiCompletion accepts UiKit inputs and renders their components', () => {
  // Arrange
  useStructuredCompletionMock.mockReset();

  const structuredOutput = {
    ui: [
      {
        UiKitButton: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
          },
          children: [],
        },
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

  const UiKitButton = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const uiKit = ɵcreateUiKit({
    components: [
      {
        component: UiKitButton,
        name: 'UiKitButton',
        description: 'renders a button',
        props: {
          label: s.string('label'),
        },
      },
    ],
  });

  // Act
  const { result } = renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
      model: 'gpt-4o-mini',
      system: 'system prompt',
      components: [uiKit],
    }),
  );

  // Assert
  expect(result.current.ui).toHaveLength(1);
  expect(result.current.ui?.[0]?.type).toBe(UiKitButton);
});

test('useUiCompletion compiles system prompts with normalized components', () => {
  // Arrange
  useStructuredCompletionMock.mockReset();

  const UiKitButton = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const uiKit = ɵcreateUiKit({
    components: [
      {
        component: UiKitButton,
        name: 'UiKitButton',
        description: 'renders a button',
        props: {
          label: s.string('label'),
        },
      },
    ],
  });

  const systemPrompt = {
    compile: vi.fn(() => 'compiled'),
    examples: [],
    diagnostics: [],
    meta: { uiBlocks: [] },
  };

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

  // Act
  renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
      model: 'gpt-4o-mini',
      system: systemPrompt,
      components: [uiKit],
    }),
  );

  const [components] = systemPrompt.compile.mock.calls[0] ?? [];
  const hasUIKit = Array.isArray(components)
    ? components.some((entry) => ɵisUiKit(entry))
    : false;

  // Assert
  expect(systemPrompt.compile).toHaveBeenCalledTimes(1);
  expect(hasUIKit).toBe(false);
});
