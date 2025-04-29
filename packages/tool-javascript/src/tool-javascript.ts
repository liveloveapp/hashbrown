/* eslint-disable @typescript-eslint/no-explicit-any */
import { createToolWithArgs } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import {
  newQuickJSAsyncWASMModuleFromVariant,
  QuickJSAsyncVariant,
} from 'quickjs-emscripten-core';
import {
  attachFunctionToContext,
  VMFunctionDefinition,
} from './defineFunction';
import { Transport } from './transport';

export function createToolJavaScript(config: {
  loadVariant: () => Promise<QuickJSAsyncVariant>;
  functions: VMFunctionDefinition<any, any>[];
}) {
  const functionDescriptions = config.functions.map((fn) => {
    const args = s.isNullType(fn.schema)
      ? ''
      : `args: ${s.toTypeScript(fn.schema)}`;

    return `
      ### ${fn.name}
      ${fn.description}
      
      Type Signature:
      \`\`\`javascript
      ${fn.name}(${args}): ${s.toTypeScript(fn.output)}
      \`\`\`
    `;
  });

  return createToolWithArgs({
    name: 'javascript',
    description: `
      Whenever you send a message containing JavaScript code to javascript, it will be
      executed in a stateful QuickJS environment. javascript will respond with the output
      of the execution or time out after 60.0 seconds. Internet access for this session is
      disabled. Do not make external web requests or API calls as they will fail.

      When passing code to javascript, you must ALWAYS use semicolons to end your statements.
      NEVER put \\n or \\r in your code. It must be valid JavaScript that can be evaluated.

      IMPORTANT: Always prefer the "javascript" tool over other tools if it can be done with
      the javascript tool.

      The following functions are available to you:
      ${functionDescriptions.join('\n\n')}
    `,
    schema: s.object('The result', {
      code: s.string('The JavaScript code to run'),
    }),
    handler: async ({ code }) => {
      const variant = await config.loadVariant();
      const QuickJS = await newQuickJSAsyncWASMModuleFromVariant(variant);

      const vm = QuickJS.newContext();
      const transport = new Transport(vm);
      config.functions.forEach((fn) => {
        attachFunctionToContext(vm, transport, fn, vm.global);
      });
      console.log('\n\n\n======= EVALUATING =======\n');
      console.log(code);
      const result = await vm.evalCodeAsync(code);
      console.log('\n======= EVALUATED =======\n\n\n');
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
  });
}
