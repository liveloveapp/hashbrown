import type { Page } from '@playwright/test';

/** Installs aimock browser shims, optionally observing WebLLM in the same atomic initializer. */
export async function installLocalModelShim(
  page: Page,
  url: string,
  options: { readonly observeWebLlm?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ url, observeWebLlm }) => {
      type Message = { role: string; content: string };
      type Chunk = {
        choices: {
          delta: { content?: string };
          finish_reason?: string | null;
        }[];
      };
      const calls: unknown[] = [];
      const lifecycle: string[] = [];

      async function* generate(
        request: { messages: Message[]; response_format?: unknown },
        signal: AbortSignal,
      ): AsyncGenerator<Chunk> {
        calls.push(request);
        const response = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            ...request,
            stream: true,
            model: 'local-fixture',
          }),
        });
        if (!response.ok || !response.body)
          throw new Error(`aimock HTTP ${response.status}`);
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = '';
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            buffer += result.value;
            let newline: number;
            while ((newline = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') return;
              yield JSON.parse(data) as Chunk;
            }
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      }

      const languageModel = {
        availability: async () => 'downloadable',
        async create(options: {
          initialPrompts?: Message[];
          monitor?: (monitor: EventTarget) => void;
        }) {
          const monitor = new EventTarget();
          options.monitor?.(monitor);
          monitor.dispatchEvent(
            Object.assign(new Event('downloadprogress'), { loaded: 1 }),
          );
          lifecycle.push('created');
          return {
            prompt: async () => '',
            promptStreaming(
              messages: Message[],
              promptOptions: {
                signal: AbortSignal;
                responseConstraint?: object;
              },
            ) {
              if (messages.some((message) => message.role === 'system'))
                throw new TypeError('System messages belong in initialPrompts');
              const iterator = generate(
                {
                  messages: [...(options.initialPrompts ?? []), ...messages],
                  ...(promptOptions.responseConstraint
                    ? {
                        response_format: {
                          type: 'json_object',
                          schema: JSON.stringify(
                            promptOptions.responseConstraint,
                          ),
                        },
                      }
                    : {}),
                },
                promptOptions.signal,
              );
              return new ReadableStream<string>({
                async pull(controller) {
                  try {
                    while (true) {
                      const result = await iterator.next();
                      if (result.done) {
                        controller.close();
                        return;
                      }
                      const content = result.value.choices[0]?.delta.content;
                      if (content) {
                        controller.enqueue(content);
                        return;
                      }
                    }
                  } catch (error) {
                    controller.error(error);
                  }
                },
                async cancel() {
                  await iterator.return(undefined);
                },
              });
            },
            destroy() {
              lifecycle.push('destroyed');
            },
          };
        },
      };
      let engineController = new AbortController();
      const engine = {
        chat: {
          completions: {
            async create(request: {
              messages: Message[];
              response_format?: unknown;
            }) {
              engineController = new AbortController();
              return generate(request, engineController.signal);
            },
          },
        },
        interruptGenerate() {
          lifecycle.push('interrupted');
          engineController.abort();
        },
      };
      const observation = globalThis as unknown as {
        __webLlmRawChunks: Chunk[];
        __webLlmActive: number;
      };
      if (observeWebLlm) {
        observation.__webLlmRawChunks = [];
        observation.__webLlmActive = 0;
      }
      const selectedEngine = observeWebLlm
        ? {
            ...engine,
            chat: {
              completions: {
                async create(
                  request: Parameters<typeof engine.chat.completions.create>[0],
                ) {
                  const stream = await engine.chat.completions.create(request);
                  const iterator = stream[Symbol.asyncIterator]();
                  observation.__webLlmActive++;
                  let settled = false;
                  const settle = () => {
                    if (!settled) {
                      settled = true;
                      observation.__webLlmActive--;
                    }
                  };
                  return {
                    [Symbol.asyncIterator]: () => ({
                      async next() {
                        try {
                          const result = await iterator.next();
                          if (result.done) settle();
                          else
                            observation.__webLlmRawChunks.push(
                              structuredClone(result.value),
                            );
                          return result;
                        } catch (error) {
                          settle();
                          throw error;
                        }
                      },
                    }),
                  };
                },
              },
            },
          }
        : engine;
      Object.assign(globalThis, {
        LanguageModel: languageModel,
        __hashbrownWebLlm: selectedEngine,
        __localModelCalls: calls,
        __localModelLifecycle: lifecycle,
      });
    },
    { url, observeWebLlm: options.observeWebLlm === true },
  );
}
