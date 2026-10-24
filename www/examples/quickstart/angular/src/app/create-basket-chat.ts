import {
  chatResource,
  createRuntime,
  createRuntimeFunction,
  createToolJavaScript,
} from '@hashbrownai/angular';
import { basketArgs, basketResult, readBasket } from '../../../runtime/basket';

/** Creates a text chat; call from a component field initializer or injection context. */
export function createBasketChat() {
  const runtime = createRuntime({
    timeout: 1_000,
    functions: [
      createRuntimeFunction({
        name: 'readBasket',
        description: 'Read the USD basket. Prices are integer cents.',
        args: basketArgs,
        result: basketResult,
        handler: async (input) => readBasket(input),
      }),
    ],
  });
  const javascript = createToolJavaScript({ runtime });

  return chatResource({
    system:
      'Use javascript to calculate basket totals. Each call starts fresh. Return the total in USD.',
    tools: [javascript],
  });
}
