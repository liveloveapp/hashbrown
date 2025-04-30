/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '@hashbrownai/core';
import {
  useCompletion,
  UseCompletionOptions,
  UseCompletionResult,
} from './use-completion';
import { useCallback, useMemo } from 'react';

export interface UseStructuredCompletionOptions<
  Input,
  Output extends s.HashbrownType,
> extends Omit<UseCompletionOptions, 'input' | 'examples'> {
  input: Input;
  examples?: { input: Input; output: s.Infer<Output> }[];
  output: Output;
}

export interface UseStructuredCompletionResult<
  Input,
  Output extends s.HashbrownType,
> extends Omit<UseCompletionResult, 'output' | 'setExamples'> {
  output: s.Infer<Output> | null;
  setOutput: (output: Output) => void;
  setExamples: (examples: { input: Input; output: s.Infer<Output> }[]) => void;
}

function stringifyExample(example: { input: any; output: any }) {
  return {
    input: JSON.stringify(example.input),
    output: JSON.stringify(example.output),
  };
}

export const useStructuredCompletion = <Input, Output extends s.HashbrownType>(
  options: UseStructuredCompletionOptions<Input, Output>,
): UseStructuredCompletionResult<Input, Output> => {
  const { input, output: initialOutputSchema, ...completionOptions } = options;
  const stringifiedInput = useMemo(() => JSON.stringify(input), [input]);

  const completion = useCompletion({
    ...completionOptions,
    input: stringifiedInput,
    examples: options.examples?.map(stringifyExample),
    θoutput: initialOutputSchema,
  });

  const output = useMemo(() => {
    if (!completion.output) return null;
    if (!completion.θoutput) return null;

    return s.parse(completion.θoutput, completion.output);
  }, [completion.output, completion.θoutput]);

  const setExamples = useCallback(
    (examples: { input: Input; output: s.Infer<Output> }[]) => {
      completion.setExamples(examples.map(stringifyExample));
    },
    [completion],
  );

  return {
    ...completion,
    setOutput: completion.θsetOutput,
    output,
    setExamples,
  };
};
