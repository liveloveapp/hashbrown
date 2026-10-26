import type {
  ExperimentalWebLlmToolsTransportOptions,
  WebLlmToolPhase,
  WebLlmToolsTurnContext,
} from './index';
import type {
  ExperimentalWebLlmImageTransportOptions,
  WebLlmEngine,
} from './experimental-webllm-transport';

/** Compile-only checks for the text-only synchronous selector contract. */
function checkContracts(
  engine: WebLlmEngine,
  media: ExperimentalWebLlmImageTransportOptions['media'],
) {
  const accept = (options: ExperimentalWebLlmToolsTransportOptions) => options;
  const selector = (context: WebLlmToolsTurnContext): WebLlmToolPhase =>
    context.completedCalls.length
      ? { type: 'finalize' }
      : { type: 'tool', name: 'lookup' };
  accept({ engine, toolPhase: selector });
  // @ts-expect-error The application must provide a synchronous phase selector.
  accept({ engine });
  // @ts-expect-error Async selectors cannot route inference.
  accept({ engine, toolPhase: async () => ({ type: 'finalize' as const }) });
  // @ts-expect-error Tool inference is text-only.
  accept({ engine, toolPhase: selector, media });
  const variable = { engine, toolPhase: selector, media };
  // @ts-expect-error Variables cannot bypass the media exclusion.
  accept(variable);
}

test('requires a synchronous selector and rejects media through literals and variables', () => {
  expect(typeof checkContracts).toBe('function');
});
