/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '@hashbrownai/core';
import { Message } from 'packages/core/src/models/chat';
import { useEffect, useMemo } from 'react';
import {
  useStructuredChat,
  UseStructuredChatOptions,
  UseStructuredChatResult,
} from './use-structured-chat';

export interface UseStructuredCompletionOptions<
  Input,
  Output extends s.HashbrownType,
> extends UseStructuredChatOptions<Output> {
  input: Input;
  system: string;
  examples?: { input: Input; output: s.Infer<Output> }[];
}

export interface UseStructuredCompletionResult<Output extends s.HashbrownType>
  extends Omit<UseStructuredChatResult<Output>, 'messages'> {
  output: Output;
}

export const useStructuredCompletion = <Input, Output extends s.HashbrownType>(
  options: UseStructuredCompletionOptions<Input, Output>,
): UseStructuredCompletionResult<Output> => {
  const { input, system, examples, ...structuredChatOptions } = options;

  const fullInstructions = useMemo(() => {
    return `
    ${system}

    ## Examples
    ${examples
      ?.map(
        (example) => `
        Input: ${JSON.stringify(example.input)}
        Output: ${JSON.stringify(example.output)}
      `,
      )
      .join('\n')}
    `;
  }, [system, examples]);

  const stringifiedInput = useMemo(
    () => (input ? JSON.stringify(input) : null),
    [input],
  );

  const messages = useMemo(() => {
    if (!stringifiedInput) {
      return [
        {
          role: 'system',
          content: fullInstructions,
        },
      ];
    }

    return [
      { role: 'system', content: fullInstructions },
      { role: 'user', content: stringifiedInput },
    ];
  }, [fullInstructions, stringifiedInput]);

  const structuredChat = useStructuredChat({
    ...structuredChatOptions,
  });

  useEffect(() => {
    structuredChat.setMessages(messages as Message<string>[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const resultOutput = useMemo(() => {
    if (!structuredChat.messages) {
      return null;
    }
    const lastMessage =
      structuredChat.messages[structuredChat.messages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.content
    ) {
      return lastMessage.content;
    }
    return null;
  }, [structuredChat.messages]);

  return {
    ...structuredChat,
    output: resultOutput as Output,
  };
};
