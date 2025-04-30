import { Chat } from '@hashbrownai/core';
import { useEffect, useMemo, useState } from 'react';
import { useChat, UseChatOptions, UseChatResult } from './use-chat';

export interface UseCompletionOptions extends Omit<UseChatOptions, 'messages'> {
  /**
   * The input string to predict from.
   */
  input: string;
  /**
   * A more detailed description of what is to be predicted.
   */
  details?: string;
  /**
   * Example input and output pairs to guide the prediction.
   */
  examples?: { input: string; output: string }[];
}

export interface UseCompletionResult extends UseChatResult {
  output: string | null;
  setExamples: (examples: { input: string; output: string }[]) => void;
}

export const useCompletion = (
  options: UseCompletionOptions,
): UseCompletionResult => {
  const { examples: initialExamples } = options;
  const [examples, setExamples] = useState<{ input: string; output: string }[]>(
    initialExamples || [],
  );
  const { stop, setMessages, ...chat } = useChat({
    ...options,
  });

  const systemPrompt = useMemo(
    () =>
      [
        'You are an AI that predicts the output based on the input.',
        'The input will be provided. Your response must match the output schema.',
        'There is no reason to include any other text in your response.\n',
        options.details
          ? `Here's a more detailed description of what you are predicting:\n ${options.details}\n`
          : '',
        examples
          ? `Here are examples:\n ${examples
              .map((example) =>
                [
                  `Input: ${example.input}`,
                  `Output: ${JSON.stringify(example.output)}`,
                ].join('\n'),
              )
              .join('\n')}`
          : '',
      ].join('\n'),
    [options.details, examples],
  );

  const systemMessage: Chat.SystemMessage = useMemo(() => {
    return {
      role: 'system',
      content: systemPrompt,
    };
  }, [systemPrompt]);

  useEffect(() => {
    console.log('input', options.input);
    if (!options.input) return;

    setMessages([
      systemMessage as Chat.Message,
      { role: 'user', content: options.input },
    ]);
  }, [setMessages, options.input, systemMessage]);

  const output: string | null = useMemo(() => {
    const message = chat.messages.find(
      (message) =>
        message.role === 'assistant' &&
        !(message.tool_calls && message.tool_calls.length),
    );

    if (!message) return null;
    if (typeof message.content !== 'string') return null;

    return message.content;
  }, [chat.messages]);

  return {
    ...chat,
    stop,
    setMessages,
    output,
    setExamples,
  };
};
