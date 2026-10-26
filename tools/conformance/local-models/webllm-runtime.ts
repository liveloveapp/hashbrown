import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { arch, cpus, platform, totalmem } from 'node:os';
import type {
  WebLlmChunk,
  WebLlmEngine,
  WebLlmImageContent,
  WebLlmRequest,
} from '@hashbrownai/core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** Summarizes image transport inputs without retaining image URLs, bytes or prompt text. */
export function summarizeWebLlmImages(
  request: WebLlmRequest<WebLlmImageContent>,
): {
  imageCount: number;
  totalBytes: number;
  images: { mime: string; bytes: number }[];
} {
  const images: { mime: string; bytes: number }[] = [];
  for (const message of request.messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type !== 'image_url') continue;
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
        part.image_url.url,
      );
      if (!match)
        throw new Error(
          'Expected a canonical serialized image in the vision fixture.',
        );
      const padding = match[2].endsWith('==')
        ? 2
        : match[2].endsWith('=')
          ? 1
          : 0;
      images.push({
        mime: match[1],
        bytes: (match[2].length * 3) / 4 - padding,
      });
    }
  }
  return {
    imageCount: images.length,
    totalBytes: images.reduce((sum, image) => sum + image.bytes, 0),
    images,
  };
}

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
export async function startWebLlmRuntime(
  modulePath = process.env['WEBLLM_MODULE_PATH'],
): Promise<{
  url: string;
  bundleSha256: string;
  stop(): Promise<void>;
}> {
  const path = modulePath;
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
    bundleSha256: createHash('sha256').update(source).digest('hex'),
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
  options: { readonly images?: boolean } = {},
): Promise<void> {
  const maxTokens = Number(process.env['WEBLLM_MAX_TOKENS'] ?? 256);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2048)
    throw new Error('WEBLLM_MAX_TOKENS must be an integer from 1 to 2048.');
  const processors = cpus();
  const machine = {
    platform: platform(),
    architecture: arch(),
    cpu: processors[0]?.model,
    cpuCount: processors.length,
    ramBytes: totalmem(),
  };
  await page.addInitScript(
    ({ moduleUrl, model, machine, maxTokens, images, summarizeSource }) => {
      type Engine = {
        chat: {
          completions: {
            create(
              request: WebLlmRequest<WebLlmImageContent> & {
                max_tokens: number;
                temperature: number;
                seed: number;
              },
            ): Promise<AsyncIterable<WebLlmChunk>> | AsyncIterable<WebLlmChunk>;
          };
        };
        interruptGenerate(): void;
        unload(): Promise<void>;
      };
      const summarize = new Function(
        'return (' + summarizeSource + ')',
      )() as typeof summarizeWebLlmImages;
      const pendingRequests = new Set<Promise<void>>();
      type Runtime = {
        CreateWebWorkerMLCEngine(
          worker: Worker,
          model: string,
          options: object,
        ): Promise<Engine>;
        prebuiltAppConfig: {
          model_list: {
            model_id: string;
            model?: string;
            model_lib?: string;
            vram_required_MB?: number;
          }[];
        };
      };
      const metrics: Record<string, unknown> = {
        model,
        requests: [],
        maxTokens,
        imagesEnabled: images,
        loadedEngines: 0,
        activeRequests: 0,
        environment: {
          ...machine,
          userAgent: navigator.userAgent,
          browserCpuCount: navigator.hardwareConcurrency,
        },
      };
      const browser = globalThis as unknown as {
        __hashbrownWebLlm: WebLlmEngine<WebLlmImageContent>;
        __localWebLlmVisionEvidence: {
          schema?: string;
          responseText: string;
        }[];
        __localWebLlmReady: boolean;
        __localWebLlmMaxTokens?: number;
        __localWebLlmMetrics: typeof metrics;
        __localWebLlmDispose(): Promise<void>;
      };
      browser.__localWebLlmMetrics = metrics;
      browser.__localWebLlmVisionEvidence = [];
      const gpu = (
        navigator as unknown as {
          gpu?: {
            requestAdapter(): Promise<{
              info?: {
                vendor: string;
                architecture: string;
                device: string;
                description: string;
              };
              features: Set<string>;
            } | null>;
          };
        }
      ).gpu;
      void gpu
        ?.requestAdapter()
        .then((adapter) => {
          if (adapter)
            metrics['gpu'] = {
              vendor: adapter.info?.vendor,
              architecture: adapter.info?.architecture,
              device: adapter.info?.device,
              description: adapter.info?.description,
              features: Array.from(adapter.features),
            };
        })
        .catch((error: unknown) => {
          metrics['gpuInfoError'] = String(error);
        });

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
        const record = runtime.prebuiltAppConfig.model_list.find(
          (record) => record.model_id === model,
        );
        metrics['catalogVramEstimateMB'] = record?.vram_required_MB;
        metrics['modelSourceUrl'] = record?.model;
        metrics['modelLibraryUrl'] = record?.model_lib;
        const engine = await runtime.CreateWebWorkerMLCEngine(worker, model, {
          initProgressCallback: (report: {
            progress: number;
            text: string;
          }) => {
            metrics['progress'] = report;
          },
        });
        metrics['loadMs'] = performance.now() - loadingStart;
        metrics['loadedEngines'] = 1;
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
            async *create(request: WebLlmRequest<WebLlmImageContent>) {
              const engine = await ready;
              let settled!: () => void;
              const pending = new Promise<void>((resolve) => {
                settled = resolve;
              });
              const started = performance.now();
              const measurement: Record<string, unknown> = {
                schemaBytes: request.response_format?.schema.length ?? 0,
                ...(images ? summarize(request) : {}),
                maxTokens: browser.__localWebLlmMaxTokens ?? maxTokens,
              };
              pendingRequests.add(pending);
              metrics['activeRequests'] = pendingRequests.size;
              (metrics['requests'] as unknown[]).push(measurement);
              let text = '';
              try {
                // Application-owned generation settings bound runtime cost and variance.
                for await (const chunk of await engine.chat.completions.create({
                  ...request,
                  max_tokens: browser.__localWebLlmMaxTokens ?? maxTokens,
                  temperature: 0,
                  seed: 1,
                })) {
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
                measurement['drained'] = true;
              } finally {
                measurement['totalMs'] = performance.now() - started;
                measurement['outputCharacters'] = text.length;
                if (images)
                  browser.__localWebLlmVisionEvidence.push({
                    schema: request.response_format?.schema,
                    responseText: text,
                  });
                else measurement['text'] = text;
                pendingRequests.delete(pending);
                metrics['activeRequests'] = pendingRequests.size;
                settled();
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
              ready.then(async (engine) => {
                if (images && pendingRequests.size) {
                  engine.interruptGenerate();
                  await Promise.allSettled([...pendingRequests]);
                }
                await engine.unload();
                metrics['unloaded'] = true;
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('WebLLM unload timed out')),
                  images ? 30_000 : 5000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
            worker.terminate();
            metrics['workerTerminated'] = true;
            URL.revokeObjectURL(workerUrl);
          }
        })());
    },
    {
      moduleUrl,
      model,
      machine,
      maxTokens,
      images: !!options.images,
      summarizeSource: summarizeWebLlmImages.toString(),
    },
  );
}
