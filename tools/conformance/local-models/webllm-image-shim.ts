import type {
  WebLlmChunk,
  WebLlmEngine,
  WebLlmImageContent,
  WebLlmRequest,
} from '@hashbrownai/core';
import type { Page } from '@playwright/test';

/** Payload-free evidence captured from the deterministic image worker. */
export interface ImageContractMetrics {
  requests: {
    imageCount: number;
    totalBytes: number;
    images: { mime: string; bytes: number; width: number; height: number }[];
  }[];
  started: number;
  interrupts: number;
  drained: number;
}

/** Installs a model-free worker engine; image bytes cross only the worker request boundary. */
export async function installWebLlmImageShim(
  page: Page,
  mode: 'complete' | 'stream' | 'setup' = 'complete',
): Promise<void> {
  const source = `(${imageWorker.toString()})()`;
  await page.addInitScript(
    ({ source, mode }) => {
      const url = URL.createObjectURL(
        new Blob([source], { type: 'application/javascript' }),
      );
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      let sequence = 0;
      const pending = new Map<
        number,
        { resolve(value: WorkerReply): void; reject(error: Error): void }
      >();
      const runtime = globalThis as unknown as {
        __hashbrownWebLlm: WebLlmEngine<WebLlmImageContent>;
        __imageContractMetrics: ImageContractMetrics;
        __imageWorkerMode: 'complete' | 'stream' | 'setup';
        __releaseImageWorker(): void;
        __disposeImageWorker(): void;
      };
      const metrics: ImageContractMetrics = {
        requests: [],
        started: 0,
        interrupts: 0,
        drained: 0,
      };
      runtime.__imageContractMetrics = metrics;
      runtime.__imageWorkerMode = mode;
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const owned = pending.get(event.data.id);
        pending.delete(event.data.id);
        if (event.data.error) owned?.reject(new Error(event.data.error));
        else owned?.resolve(event.data);
      };
      const send = (message: object): Promise<WorkerReply> =>
        new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve, reject });
          worker.postMessage({ ...message, id });
        });
      runtime.__hashbrownWebLlm = {
        chat: {
          completions: {
            create: async (request: WebLlmRequest<WebLlmImageContent>) => {
              metrics.started++;
              const ready = await send({
                kind: 'create',
                request,
                mode: runtime.__imageWorkerMode,
              });
              if (ready.metadata) metrics.requests.push(ready.metadata);
              return {
                [Symbol.asyncIterator]: () => ({
                  next: async () => {
                    const result = await send({ kind: 'next' });
                    if (!result.result)
                      throw new Error('Missing worker iterator result.');
                    if (result.result.done) metrics.drained++;
                    return result.result;
                  },
                }),
              };
            },
          },
        },
        interruptGenerate() {
          metrics.interrupts++;
          worker.postMessage({ kind: 'interrupt' });
        },
      };
      runtime.__releaseImageWorker = () =>
        worker.postMessage({ kind: 'release' });
      runtime.__disposeImageWorker = () => worker.terminate();
    },
    { source, mode },
  );
}

interface WorkerReply {
  id: number;
  error?: string;
  metadata?: ImageContractMetrics['requests'][number];
  result?: IteratorResult<WebLlmChunk>;
}

/** Runs inside an isolated browser worker without importing any inference runtime. */
function imageWorker(): void {
  let mode = 'complete';
  let interrupted = false;
  let step = 0;
  let waiting: number | undefined;
  let held: WorkerReply | undefined;
  const reply = (value: WorkerReply) => globalThis.postMessage(value);
  const done = (id: number) =>
    reply({ id, result: { done: true, value: undefined } });
  globalThis.onmessage = async (
    event: MessageEvent<{
      kind: string;
      id: number;
      request: WebLlmRequest<WebLlmImageContent>;
      mode: string;
    }>,
  ) => {
    const message = event.data;
    try {
      if (message.kind === 'interrupt') {
        interrupted = true;
        if (waiting !== undefined) {
          done(waiting);
          waiting = undefined;
        }
      } else if (message.kind === 'release') {
        if (held) {
          reply(held);
          held = undefined;
        }
      } else if (message.kind === 'create') {
        mode = message.mode;
        interrupted = false;
        step = 0;
        const images: ImageContractMetrics['requests'][number]['images'] = [];
        for (const turn of message.request.messages) {
          if (typeof turn.content === 'string') continue;
          if (turn.role !== 'user')
            throw new Error('Only user images may cross the worker boundary.');
          let text = false;
          for (const part of turn.content) {
            if (part.type === 'text') {
              if (text) throw new Error('Trailing text must be coalesced.');
              text = true;
              continue;
            }
            if (text || Object.keys(part.image_url).join(',') !== 'url')
              throw new Error('Invalid image ordering or protocol fields.');
            const match =
              /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
                part.image_url.url,
              );
            if (!match)
              throw new Error(
                'Only canonical serialized image data may cross the worker boundary.',
              );
            const binary = atob(match[2]);
            const bytes = Uint8Array.from(binary, (character) =>
              character.charCodeAt(0),
            );
            const bitmap = await createImageBitmap(
              new Blob([bytes], { type: match[1] }),
            );
            try {
              images.push({
                mime: match[1],
                bytes: bytes.length,
                width: bitmap.width,
                height: bitmap.height,
              });
            } finally {
              bitmap.close();
            }
          }
        }
        if (!images.length)
          throw new Error(
            'The image fixture must include generated image input.',
          );
        const ready = {
          id: message.id,
          metadata: {
            images,
            imageCount: images.length,
            totalBytes: images.reduce((sum, image) => sum + image.bytes, 0),
          },
        };
        if (mode === 'setup') held = ready;
        else reply(ready);
      } else if (message.kind === 'next') {
        if (interrupted || (step > 0 && mode === 'complete')) done(message.id);
        else if (step++ === 0)
          reply({
            id: message.id,
            result: {
              done: false,
              value: { choices: [{ delta: { content: 'Red' } }] },
            },
          });
        else waiting = message.id;
      }
    } catch {
      reply({
        id: message.id,
        error: 'Deterministic image worker contract failed.',
      });
    }
  };
}
