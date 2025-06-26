/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  attachFunctionToContext,
  RuntimeFunctionRef,
} from './create-runtime-function-impl';
import { RuntimeTransport } from './transport';

/**
 * A reference to a JavaScript runtime.
 */
export interface RuntimeRef {
  /**
   * The functions that are available in the runtime.
   */
  readonly functions: [...RuntimeFunctionRef<any, any>[]];

  /**
   * The timeout for the runtime.
   */
  readonly timeout: number;

  /**
   * Describes the runtime to the LLM.
   *
   * Example:
   *
   * ```js
   * const description = runtime.describe();
   * ```
   */
  readonly describe: () => string;

  /**
   * Run JavaScript code in the runtime.
   *
   * Example:
   *
   * ```js
   * const result = await runtime.run('return 1 + 1;', AbortSignal.timeout(1000));
   * ```
   *
   * @param code - The JavaScript code to run.
   * @param abortSignal - An optional abort signal to cancel the operation.
   * @returns The result of the code execution.
   */
  readonly run: (code: string, abortSignal: AbortSignal) => Promise<any>;
}

/**
 * Creates a new runtime.
 *
 * @param options - The options for creating the runtime.
 * @param options.timeout - The timeout for the runtime.
 * @param options.functions - The functions that are available in the runtime.
 * @returns A reference to the runtime.
 */
export function createRuntimeImpl(options: {
  /**
   * The timeout for the runtime.
   *
   * @default 10000
   */
  timeout?: number;

  /**
   * The functions that are available in the runtime.
   */
  functions: [...RuntimeFunctionRef<any, any>[]];
}): RuntimeRef {
  const { timeout = 1_000, functions } = options;
  const description = functions
    .map((fn) => {
      const argsWithType = fn.args ? `args: ${fn.args.toTypeScript()}` : '';
      const returnType = fn.result ? fn.result.toTypeScript() : 'void';

      return [
        `### ${fn.name}`,
        fn.description,
        '',
        `**Type Signature:**`,
        `\`\`\`typescript`,
        `${fn.name}(${argsWithType}): ${returnType}`,
        `\`\`\``,
      ].join('\n');
    })
    .join('\n\n');

  return {
    functions,
    timeout,
    describe() {
      return description;
    },
    async run(code: string, abortSignal?: AbortSignal) {
      const signal = abortSignal
        ? AbortSignal.any([abortSignal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout);
      const [{ newQuickJSAsyncWASMModuleFromVariant }, variant] =
        await Promise.all([
          import('quickjs-emscripten-core'),
          import('@jitl/quickjs-singlefile-browser-debug-asyncify').then(
            (m) => m.default,
          ),
        ]);
      const QuickJS = await newQuickJSAsyncWASMModuleFromVariant(variant);

      const runtime = QuickJS.newRuntime({
        interruptHandler: () => {
          return signal.aborted;
        },
      });
      const vm = runtime.newContext();
      const transport = new RuntimeTransport(vm);
      options.functions.forEach((fn) => {
        attachFunctionToContext(vm, transport, fn, vm.global, signal);
      });

      const result = await vm.evalCodeAsync(code);

      if (result.error) {
        const response = {
          error: vm.dump(result.error),
        };
        result.error.dispose();
        vm.dispose();
        return response;
      } else {
        const response = {
          result: vm.dump(result.value),
        };
        result.value.dispose();
        vm.dispose();
        return response;
      }
    },
  };
}
