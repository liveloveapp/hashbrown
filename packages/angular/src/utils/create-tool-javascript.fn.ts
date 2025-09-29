import { Chat, RuntimeRef, s } from '@hashbrownai/core';
import { createTool } from './create-tool.fn';

/**
 * Options for creating a tool that can run JavaScript code.
 *
 * @public
 */
export interface CreateToolJavaScriptOptions {
  /**
   * The runtime to use for the JavaScript code, created with `defineAsyncRuntime`.
   */
  runtime: RuntimeRef;
}

/**
 * The schema for the javascript tool.
 */
const schema = s.streaming.object('The result', {
  code: s.streaming.string('The JavaScript code to run'),
});

/**
 * Creates a tool that allows the LLM to run JavaScript code. It is run
 * in a stateful JavaScript environment, with no access to the internet, the DOM,
 * or any function that you have not explicitly defined.
 *
 * @public
 * @param options - The options for creating the tool.
 * @returns The tool.
 */
export function createToolJavaScript<Result>({
  runtime,
}: CreateToolJavaScriptOptions): Chat.Tool<
  'javascript',
  s.Infer<typeof schema>,
  Result
> {
  return createTool({
    name: 'javascript',
    description: [
      'Whenever you send a message containing JavaScript code to javascript, it will be',
      'executed in a stateful JavaScript environment. javascript will respond with the output',
      'of the execution or time out after ${runtime.timeout / 1000} seconds. Internet access',
      'for this session is disabled. Do not make external web requests or API calls as they',
      'will fail.',
      '',
      'Important: Prefer calling javascript once with a large amount of code, rather than calling it',
      'multiple times with smaller amounts of code.',
      '',
      'The following functions are available to you:',
      runtime.describe(),
    ].join('\n'),
    schema,
    handler: async ({ code }, abortSignal) => {
      return runtime.run(code, abortSignal);
    },
  });
}
