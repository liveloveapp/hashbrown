import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WebLlmEngine, WebLlmRequest } from '@hashbrownai/core';
import { execFileSync } from 'node:child_process';

/** Reports process RSS separately from the model catalog's estimated VRAM. */
export async function readBrowserMemory(page: Page): Promise<unknown> {
  const browser = page.context().browser();
  if (!browser || process.platform === 'win32') return { available: false };
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const values = execFileSync(
      'ps',
      ['-o', 'rss=', '-p', processInfo.map((entry) => entry.id).join(',')],
      { encoding: 'utf8' },
    )
      .trim()
      .split(/\s+/)
      .map(Number);
    return {
      aggregateRssKiB: values.reduce((sum, value) => sum + value, 0),
      note: 'Sum of browser process RSS; shared pages may be counted more than once. This is not a measurement of unique GPU allocations.',
    };
  } finally {
    await session.detach();
  }
}

/** Serves an application-provided WebLLM browser bundle without a package dependency. */
export async function startWebLlmRuntime(): Promise<{
  url: string;
  stop(): Promise<void>;
}> {
  const path = process.env['WEBLLM_MODULE_PATH'];
  if (!path)
    throw new Error(
      'Set WEBLLM_MODULE_PATH to an unpacked WebLLM lib/index.js. Hashbrown does not install WebLLM.',
    );
  const source = await readFile(path);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'text/javascript');
    if (request.url !== '/webllm.js') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.end(source);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webllm.js`;
  return {
    url,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** Prepares a real worker engine before the fixture application bootstraps. */
export async function installWebLlmWorker(
  page: Page,
  moduleUrl: string,
  model: string,
): Promise<void> {
  await page.addInitScript(
    ({ moduleUrl, model }) => {
      type Engine = WebLlmEngine & { unload(): Promise<void> };
      type Runtime = {
        CreateWebWorkerMLCEngine(
          worker: Worker,
          model: string,
          options: object,
        ): Promise<Engine>;
        prebuiltAppConfig: {
          model_list: { model_id: string; vram_required_MB?: number }[];
        };
      };
      const metrics: Record<string, unknown> = { model, requests: [] };
      const browser = globalThis as unknown as {
        __hashbrownWebLlm: WebLlmEngine;
        __localWebLlmReady: boolean;
        __localWebLlmMaxTokens?: number;
        __localWebLlmMetrics: typeof metrics;
        __localWebLlmDispose(): Promise<void>;
      };
      browser.__localWebLlmMetrics = metrics;
      const source = `import { WebWorkerMLCEngineHandler } from ${JSON.stringify(moduleUrl)}; const handler = new WebWorkerMLCEngineHandler(); self.onmessage = event => handler.onmessage(event);`;
      const workerUrl = URL.createObjectURL(
        new Blob([source], { type: 'text/javascript' }),
      );
      const worker = new Worker(workerUrl, { type: 'module' });
      const loadingStart = performance.now();
      // This import belongs to the test application, never to the published adapter.
      const importRuntime = new Function('url', 'return import(url)') as (
        url: string,
      ) => Promise<Runtime>;
      const ready = importRuntime(moduleUrl).then(async (runtime) => {
        metrics['catalogVramEstimateMB'] =
          runtime.prebuiltAppConfig.model_list.find(
            (record) => record.model_id === model,
          )?.vram_required_MB;
        const engine = await runtime.CreateWebWorkerMLCEngine(worker, model, {
          initProgressCallback: (report: {
            progress: number;
            text: string;
          }) => {
            metrics['progress'] = report;
          },
        });
        metrics['loadMs'] = performance.now() - loadingStart;
        browser.__localWebLlmReady = true;
        return engine;
      });
      void ready.catch((error: unknown) => {
        metrics['loadError'] =
          error instanceof Error ? error.message : String(error);
      });
      browser.__hashbrownWebLlm = {
        chat: {
          completions: {
            async *create(request: WebLlmRequest) {
              const engine = await ready;
              const started = performance.now();
              const measurement: Record<string, unknown> = {
                schemaBytes: request.response_format?.schema.length ?? 0,
              };
              (metrics['requests'] as unknown[]).push(measurement);
              let text = '';
              try {
                // Application-owned generation settings bound runtime cost and variance.
                const create = engine.chat.completions.create as (
                  input: WebLlmRequest & {
                    max_tokens: number;
                    temperature: number;
                    seed: number;
                  },
                ) => ReturnType<WebLlmEngine['chat']['completions']['create']>;
                for await (const chunk of await create.call(
                  engine.chat.completions,
                  {
                    ...request,
                    max_tokens: browser.__localWebLlmMaxTokens ?? 256,
                    temperature: 0,
                    seed: 1,
                  },
                )) {
                  const content = chunk.choices[0]?.delta.content;
                  if (content) {
                    measurement['firstTokenMs'] ??= performance.now() - started;
                    text += content;
                  }
                  if (chunk.choices[0]?.finish_reason)
                    measurement['finishReason'] =
                      chunk.choices[0].finish_reason;
                  yield chunk;
                }
              } finally {
                measurement['totalMs'] = performance.now() - started;
                measurement['text'] = text;
              }
            },
          },
        },
        interruptGenerate() {
          void ready.then((engine) => engine.interruptGenerate());
        },
      };
      let disposal: Promise<void> | undefined;
      browser.__localWebLlmDispose = () =>
        (disposal ??= (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              ready.then((engine) => engine.unload()),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('WebLLM unload timed out')),
                  5000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
          }
        })());
    },
    { moduleUrl, model },
  );
}
