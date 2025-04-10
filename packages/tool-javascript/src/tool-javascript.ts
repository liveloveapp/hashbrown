import { createToolWithArgs, s } from '@hashbrownai/angular';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';

export const toolJavascript = createToolWithArgs({
  name: 'javascript',
  description: `
    Whenever you send a message containing JavaScript code to javascript, it will be 
    executed in a stateful QuickJS environment. javascript will respond with the output 
    of the execution or time out after 60.0 seconds. Internet access for this session is 
    disabled. Do not make external web requests or API calls as they will fail.
  `,
  schema: s.object('The result', {
    code: s.string('The JavaScript code to run'),
  }),
  handler: async ({ code }) => {
    const { default: wasm } = await import(
      '@jitl/quickjs-singlefile-mjs-release-sync'
    );
    const QuickJS = await newQuickJSWASMModuleFromVariant(wasm);
    const vm = QuickJS.newContext();
    const result = vm.evalCode(code);
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
