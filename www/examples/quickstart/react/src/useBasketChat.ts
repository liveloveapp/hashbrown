import {
  useChat,
  useRuntime,
  useRuntimeFunction,
  useToolJavaScript,
} from '@hashbrownai/react';
import { basketArgs, basketResult, readBasket } from '../../runtime/basket';

/** Creates a text chat with a JavaScript tool for basket calculations. */
export function useBasketChat() {
  const read = useRuntimeFunction({
    name: 'readBasket',
    description: 'Read the USD basket. Prices are integer cents.',
    args: basketArgs,
    result: basketResult,
    handler: async (input) => readBasket(input),
    deps: [],
  });
  const runtime = useRuntime({ functions: [read], timeout: 1_000 });
  const javascript = useToolJavaScript({ runtime });

  return useChat({
    system:
      'Use javascript to calculate basket totals. Each call starts fresh. Return the total in USD.',
    tools: [javascript],
  });
}
