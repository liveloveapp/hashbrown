/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '@hashbrownai/core';
import {
  newQuickJSAsyncWASMModuleFromVariant,
  QuickJSAsyncVariant,
} from 'quickjs-emscripten-core';
import {
  attachFunctionToContext,
  VMFunctionDefinition,
} from './defineFunction';
import { RuntimeTransport } from './transport';

export interface DefineAsyncRuntimeOptions {
  loadVariant: () => Promise<QuickJSAsyncVariant>;
  functions: [...VMFunctionDefinition<any, any>[]];
}

export interface AsyncRuntime {
  functions: [...VMFunctionDefinition<any, any>[]];
  describe(): string;
  run(code: string, abortSignal: AbortSignal): Promise<any>;
}

export function defineAsyncRuntime(
  options: DefineAsyncRuntimeOptions,
): AsyncRuntime {
  const description = options.functions
    .map((fn) => {
      const args = s.isNullType(fn.input)
        ? ''
        : `args: ${fn.input.toTypeScript()}`;

      return `
      ### ${fn.name}
      ${fn.description}
      
      Type Signature:
      \`\`\`javascript
      ${fn.name}(${args}): ${fn.output.toTypeScript()}
      \`\`\`
    `;
    })
    .join('\n\n');

  return {
    functions: options.functions,
    describe() {
      return description;
    },
    async run(code: string, abortSignal: AbortSignal) {
      const variant = await options.loadVariant();
      const QuickJS = await newQuickJSAsyncWASMModuleFromVariant(variant);

      const runtime = QuickJS.newRuntime({
        interruptHandler: () => {
          return abortSignal.aborted;
        },
      });
      const vm = runtime.newContext();
      const transport = new RuntimeTransport(vm);
      options.functions.forEach((fn) => {
        attachFunctionToContext(vm, transport, fn, vm.global, abortSignal);
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
