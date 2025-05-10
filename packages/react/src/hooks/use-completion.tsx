import { Chat } from '@hashbrownai/core';
import { useEffect, useMemo, useState } from 'react';
import { useChat, UseChatOptions, UseChatResult } from './use-chat';

export interface UseCompletionOptions extends Omit<UseChatOptions, 'messages'> {
  /**
   * The input string to predict from.
   */
  input: string | null | undefined;
  /**
   * Example input and output pairs to guide the prediction.
   */
  examples?: { input: string; output: string }[];
  /**
   * The system prompt to use for the completion task.
   */
  system: string;
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

  const systemPrompt = useMemo(() => {
    const _system = options.system;
    return `
      ${_system}

      ## Examples
      ${examples
        .map(
          (example) => `
        Input: ${JSON.stringify(example.input)}
        Output: ${example.output}
      `,
        )
        .join('\n')}
    `;
  }, [options.system, examples]);

  const systemMessage: Chat.SystemMessage = useMemo(() => {
    return {
      role: 'system',
      content: systemPrompt,
    };
  }, [systemPrompt]);

  useEffect(() => {
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
