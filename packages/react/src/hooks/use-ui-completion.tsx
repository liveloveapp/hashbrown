/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chat, KnownModelIds, s, SystemPrompt, ɵui } from '@hashbrownai/core';
import {
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createElement } from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { useStructuredCompletion } from './use-structured-completion';
import { UiChatSchema, UiChatSchemaComponent } from './use-ui-chat';

/**
 * Options for the `useUiCompletion` hook.
 *
 * @public
 */
export interface UiCompletionOptions {
  /**
   * The input to predict from.
   */
  input: any | null | undefined;

  /**
   * The LLM model to use for the completion.
   */
  model: KnownModelIds;

  /**
   * The system message to use for the completion.
   */
  system: string | SystemPrompt;

  /**
   * The components that can be rendered by the completion.
   */
  components: ExposedComponent<any>[];

  /**
   * The tools to make available for the completion.
   * default: []
   */
  tools?: Chat.AnyTool[];

  /**
   * The debounce time between sends to the endpoint.
   * default: 150
   */
  debounceTime?: number;

  /**
   * The name of the hook, useful for debugging.
   */
  debugName?: string;

  /**
   * Number of retries if an error is received.
   * default: 0
   */
  retries?: number;
}

/**
 * The result object-type returned by the `useUiCompletion` hook that provides the rendered UI output and state for the completion.
 *
 * @public
 */
export interface UseUiCompletionResult {
  /**
   * The rendered UI components from the completion, or null if no output yet.
   */
  ui: ReactElement[] | null;

  /**
   * Reload the completion, useful for retrying when an error occurs.
   */
  reload: () => void;

  /**
   * The error encountered during completion operations, if any.
   */
  error: Error | undefined;

  /**
   * Whether the completion is receiving a response.
   */
  isReceiving: boolean;

  /**
   * Whether the completion is sending a response.
   */
  isSending: boolean;

  /**
   * Whether the completion is running tool calls.
   */
  isRunningToolCalls: boolean;

  /**
   * Whether the current request has exhausted retries.
   */
  exhaustedRetries: boolean;
}

/**
 * This React hook creates a completion instance that can generate and render UI components based on input context.
 * The result object contains the rendered UI components and state for monitoring the completion.
 *
 * @public
 * @remarks
 * The `useUiCompletion` hook provides functionality for generating UI components through completion. This is particularly useful for:
 * - Predictive UI generation based on context
 * - Smart component suggestions
 * - Context-aware UI rendering
 * - Dynamic UI based on input
 *
 * @returns An object containing the rendered UI components and completion state.
 *
 * @example
 * In this example, the LLM will predict and render UI components based on the given theme or context.
 * ```tsx
 * const { ui } = useUiCompletion({
 *   model: 'gpt-4o',
 *   system: 'You are a helpful assistant that can generate UI components based on context.',
 *   input: theme,
 *   components: [
 *     exposeComponent(Button, {
 *       name: 'Button',
 *       description: 'A clickable button component',
 *       props: {
 *         label: s.string('The text to display on the button'),
 *         onClick: s.function('Function to call when clicked')
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export const useUiCompletion = (
  options: UiCompletionOptions,
): UseUiCompletionResult => {
  const { components: initialComponents, input, ...completionOptions } = options;
  const [components, setComponents] = useState(initialComponents);
  const [flattenedComponents] = useState(
    ɵui.flattenComponents(initialComponents),
  );
  const ui = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array(
        'List of elements',
        ɵui.createComponentSchema(components),
      ),
    });
  }, [components]);
  const systemAsString = useMemo(() => {
    if (typeof completionOptions.system === 'string') {
      return completionOptions.system;
    }
    const output = completionOptions.system.compile(components, ui);
    if (completionOptions.system.diagnostics.length > 0) {
      throw new Error(
        `System prompt has ${completionOptions.system.diagnostics.length} errors: \n\n${completionOptions.system.diagnostics.map((d) => d.message).join('\n\n')}`,
      );
    }
    return output;
  }, [completionOptions.system, components, ui]);

  const completion = useStructuredCompletion({
    ...completionOptions,
    schema: ui as any,
    system: systemAsString,
    input,
  });

  const buildContent = useCallback(
    (
      nodes: string | Array<UiChatSchemaComponent>,
      parentKey = '',
    ): ReactElement[] | string => {
      if (typeof nodes === 'string') {
        return nodes;
      }

      const elements = nodes.map((element, index) => {
        const key = `${parentKey}_${index}`;

        const { $tag, $children, $props } = element;
        const componentType = flattenedComponents.get($tag)?.component;

        if ($tag && componentType) {
          const children: ReactNode[] | string | null = element.$children
            ? buildContent($children, key)
            : null;

          return createElement(componentType, {
            ...$props,
            children,
            key,
          });
        }

        throw new Error(`Unknown element type. ${$tag}`);
      });

      return elements;
    },
    [flattenedComponents],
  );

  const renderedUi = useMemo(() => {
    const output = completion.output as UiChatSchema | null;
    if (!output?.ui) {
      return null;
    }
    return buildContent(output.ui);
  }, [buildContent, completion.output]);

  useEffect(() => {
    setComponents(initialComponents);
  }, [initialComponents]);

  return {
    ui: renderedUi,
    reload: completion.reload,
    error: completion.error,
    isReceiving: completion.isReceiving,
    isSending: completion.isSending,
    isRunningToolCalls: completion.isRunningToolCalls,
    exhaustedRetries: completion.exhaustedRetries,
  };
};
