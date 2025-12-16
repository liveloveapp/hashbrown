/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Chat,
  type ModelInput,
  s,
  SystemPrompt,
  type TransportOrFactory,
  ɵui,
} from '@hashbrownai/core';
import {
  createElement,
  Dispatch,
  ReactElement,
  ReactNode,
  SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { ExposedComponent } from '../expose-component.fn';
import {
  UiAssistantMessage,
  UiChatSchema,
  UiChatSchemaComponent,
} from './use-ui-chat';
import {
  useStructuredCompletion,
  type UseStructuredCompletionResult,
} from './use-structured-completion';

/**
 * Options for the `useUiCompletion` hook.
 *
 * @public
 */
export interface UiCompletionOptions<
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
> {
  /**
   * The input for the completion.
   */
  input: Input | null | undefined;

  /**
   * The model to use for the completion.
   */
  model: ModelInput;

  /**
   * The system prompt to use for the completion.
   */
  system: string | SystemPrompt;

  /**
   * The components that can be rendered by the completion.
   */
  components: ExposedComponent<any>[];

  /**
   * The tools to make available to the completion.
   */
  tools?: Tools[];

  /**
   * The debounce time between requests.
   */
  debounceTime?: number;

  /**
   * The name of the hook, useful for debugging.
   */
  debugName?: string;

  /**
   * Number of retries if an error is received.
   */
  retries?: number;

  /**
   * Optional transport override for this hook.
   */
  transport?: TransportOrFactory;

  /**
   * Optional thread identifier used to load or continue an existing conversation.
   */
  threadId?: string;
}

/**
 * The result of the `useUiCompletion` hook.
 *
 * @public
 */
export interface UseUiCompletionResult<Tools extends Chat.AnyTool>
  extends Omit<UseStructuredCompletionResult<UiChatSchema>, 'output'> {
  /**
   * The assistant message that contains the rendered UI elements.
   */
  output: UiAssistantMessage<Tools> | null;
  /**
   * The rendered React elements produced by the completion.
   */
  ui: ReactElement[] | null;
  /**
   * The raw structured output returned by the model before rendering components.
   */
  rawOutput: UiChatSchema | null;
  /**
   * Updates the available components for future completions.
   */
  setComponents: Dispatch<SetStateAction<ExposedComponent<any>[]>>;
}

/**
 * A React hook that generates UI completions using the provided component set.
 *
 * @public
 */
export const useUiCompletion = <
  Input,
  Tools extends Chat.AnyTool = Chat.AnyTool,
>(
  options: UiCompletionOptions<Input, Tools>,
): UseUiCompletionResult<Tools> => {
  const {
    components: initialComponents,
    system,
    tools,
    ...completionOptions
  } = options;
  const [components, setComponents] = useState(initialComponents);
  const [flattenedComponents] = useState(
    ɵui.flattenComponents(initialComponents),
  );

  const uiSchema = useMemo(() => {
    return s.object('UI', {
      ui: s.streaming.array(
        'List of elements',
        ɵui.createComponentSchema(components),
      ),
    });
  }, [components]);

  const systemAsString = useMemo(() => {
    if (typeof system === 'string') {
      return system;
    }

    const compiled = system.compile(components, uiSchema);

    if (system.diagnostics.length > 0) {
      throw new Error(
        `System prompt has ${system.diagnostics.length} errors: \n\n${system.diagnostics.map((d) => d.message).join('\n\n')}`,
      );
    }

    return compiled;
  }, [system, components, uiSchema]);

  const structured = useStructuredCompletion<Input, typeof uiSchema>({
    ...completionOptions,
    schema: uiSchema as any,
    system: systemAsString,
    tools,
    ui: true,
  });

  const buildContent = useCallback(
    (
      nodes: string | Array<UiChatSchemaComponent>,
      parentKey = '',
    ): ReactElement[] | string => {
      if (typeof nodes === 'string') {
        return nodes;
      }

      const elements = nodes.map((node, index) => {
        const key = `${parentKey}_${index}`;
        const { $tag, $props, $children } = node;
        const componentType = flattenedComponents.get($tag)?.component;

        if ($tag && componentType) {
          const children: ReactNode[] | string | null = node.$children
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

  const rawOutput = structured.output;

  const message = useMemo(() => {
    if (!rawOutput) {
      return null;
    }

    return {
      role: 'assistant' as const,
      content: rawOutput,
      toolCalls: [],
      ui: rawOutput.ui ? buildContent(rawOutput.ui) : null,
    } as UiAssistantMessage<Tools>;
  }, [rawOutput, buildContent]);

  return {
    ...structured,
    output: message,
    ui: message?.ui ?? null,
    rawOutput,
    setComponents,
  };
};
