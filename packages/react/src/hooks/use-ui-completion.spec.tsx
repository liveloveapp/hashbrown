import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { expect, test, vi } from 'vitest';
import { s, ɵcreateUiKit, ɵisUiKit } from '@hashbrownai/core';
import { useStructuredCompletion } from './use-structured-completion';
import { useUiCompletion } from './use-ui-completion';

vi.mock('./use-structured-completion', () => ({
  useStructuredCompletion: vi.fn(),
}));

const useStructuredCompletionMock = vi.mocked(useStructuredCompletion);

test('useUiCompletion converts structured output into rendered React elements', () => {
  useStructuredCompletionMock.mockReset();

  const structuredOutput = {
    ui: [
      {
        TestButton: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
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
  });

  const TestButton = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const { result } = renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
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

test('useUiCompletion renders fallbacks when props are still streaming', () => {
  useStructuredCompletionMock.mockReset();

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
  });

  const TestButton = ({ label }: { label: string }) =>
    createElement('button', null, label);
  const TestButtonFallback = ({
    tag,
    partialProps,
  }: {
    tag: string;
    partialProps?: Record<string, unknown>;
  }) => createElement('span', null, `${tag}:${partialProps?.label ?? ''}`);

  const { result } = renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
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

test('useUiCompletion returns null output when the structured completion is empty', () => {
  useStructuredCompletionMock.mockReset();

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
  });

  const TestComponent = () => createElement('div', null, 'noop');

  const { result } = renderHook(() =>
    useUiCompletion({
      input: null,
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
  });

  // Act
  renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
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

test('useUiCompletion propagates thread identity without exposing persistence state', () => {
  useStructuredCompletionMock.mockReset();
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
  });
  const TestComponent = () => createElement('div', null, 'test');

  const { result } = renderHook(() =>
    useUiCompletion({
      input: 'Generate a UI',
      system: 'system prompt',
      components: [
        {
          component: TestComponent,
          name: 'TestComponent',
          description: 'test component',
        },
      ],
      threadId: 'thread-ui',
    }),
  );

  expect(useStructuredCompletionMock).toHaveBeenCalledWith(
    expect.objectContaining({ threadId: 'thread-ui' }),
  );
  expect(result.current).not.toHaveProperty('isLoadingThread');
  expect(result.current).not.toHaveProperty('isSavingThread');
  expect(result.current).not.toHaveProperty('threadLoadError');
  expect(result.current).not.toHaveProperty('threadSaveError');
  expect(result.current).not.toHaveProperty('threadId');
});

test('useUiCompletion forwards and returns shared agent state unchanged', () => {
  // Arrange
  const state = { panel: 'summary' };
  const setState = vi.fn();
  useStructuredCompletionMock.mockReset();
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
    state,
    setState,
  });

  // Act
  const { result } = renderHook(() =>
    useUiCompletion({
      input: null,
      system: 'system prompt',
      components: [],
      state,
    }),
  );

  // Assert
  expect(useStructuredCompletionMock).toHaveBeenCalledWith(
    expect.objectContaining({ state }),
  );
  expect(result.current.state).toBe(state);
  expect(result.current.setState).toBe(setState);
});
