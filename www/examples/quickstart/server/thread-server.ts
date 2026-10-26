import { HashbrownOpenAI } from '@hashbrownai/openai';
import { createThreadApp, type ThreadAppOptions } from './thread-app';

/** Server-owned provider settings plus the application's verified integrations. */
export interface ProductionThreadOptions extends Omit<
  ThreadAppOptions,
  'stream'
> {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Connects the example's authenticated routes to OpenAI. Supply a real identity
 * verifier, atomic database store, and shared admission limits from your app.
 * The API key, model, and output cap cannot be overridden by browser input.
 */
export function createProductionThreadApp(options: ProductionThreadOptions) {
  return createThreadApp({
    origin: options.origin,
    authenticate: options.authenticate,
    allowRun: options.allowRun,
    store: options.store,
    stream: (input, signal) =>
      HashbrownOpenAI.stream.text({
        apiKey: options.apiKey,
        model: options.model,
        input,
        signal,
        transformRequestOptions: (request) => ({
          ...request,
          max_output_tokens: 1024,
        }),
      }),
  });
}
