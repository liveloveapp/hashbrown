import type { WebLlmChunk, WebLlmEngine } from '@hashbrownai/core';
import type { Page } from '@playwright/test';

/** Observes the injected aimock engine without replacing its SSE or iterator behavior. */
export async function installWebLlmToolObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const runtime = globalThis as unknown as {
      __hashbrownWebLlm: WebLlmEngine;
      __webLlmRawChunks: WebLlmChunk[];
      __webLlmActive: number;
    };
    runtime.__webLlmRawChunks = [];
    runtime.__webLlmActive = 0;
    const completions = runtime.__hashbrownWebLlm.chat.completions;
    const create = completions.create.bind(completions);
    completions.create = async (request) => {
      const stream = await create(request);
      const iterator = stream[Symbol.asyncIterator]();
      runtime.__webLlmActive++;
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          runtime.__webLlmActive--;
        }
      };
      return {
        [Symbol.asyncIterator]: () => ({
          async next() {
            try {
              const result = await iterator.next();
              if (result.done) settle();
              else
                runtime.__webLlmRawChunks.push(structuredClone(result.value));
              return result;
            } catch (error) {
              settle();
              throw error;
            }
          },
        }),
      };
    };
  });
}
