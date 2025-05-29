import { createToolWithArgs } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { AsyncRuntime } from './defineRuntime';

/**
 * Options for creating a tool that can run JavaScript code.
 */
export interface CreateToolJavaScriptOptions {
  /**
   * The timeout for the JavaScript runtime. Defaults to 60 seconds.
   */
  timeout?: number;
  /**
   * The runtime to use for the JavaScript code, created with `defineAsyncRuntime`.
   */
  runtime: AsyncRuntime;
}

/**
 * Creates a tool that allows the LLM to run JavaScript code. It is run
 * in a stateful JavaScript environment, with no access to the internet, the DOM,
 * or any function that you have not explicitly defined.
 *
 * @param options - The options for creating the tool.
 * @returns The tool.
 */
export function createToolJavaScript({
  timeout = 60_000,
  runtime,
}: CreateToolJavaScriptOptions) {
  return createToolWithArgs({
    name: 'javascript',
    description: `
      Whenever you send a message containing JavaScript code to javascript, it will be
      executed in a stateful JavaScript environment. javascript will respond with the output
      of the execution or time out after ${timeout / 1000} seconds. Internet access for this session is
      disabled. Do not make external web requests or API calls as they will fail.

      Important: Prefer calling javascript once with a large amount of code, rather than calling it
      multiple times with smaller amounts of code.

      The following functions are available to you:
      ${runtime.describe()}
    `,
    schema: s.object('The result', {
      code: s.string('The JavaScript code to run'),
    }),
    handler: async ({ code }, abortSignal) => {
      const timeoutSignal = AbortSignal.timeout(timeout);
      const combinedSignal = AbortSignal.any([abortSignal, timeoutSignal]);

      return runtime.run(code, combinedSignal);
    },
  });
}
