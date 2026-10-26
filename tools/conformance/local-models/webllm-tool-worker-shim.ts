import type {
  WebLlmChunk,
  WebLlmEngine,
  WebLlmRequest,
} from '@hashbrownai/core';
import type { Page } from '@playwright/test';

/** Observable controlled-worker boundaries; requests have crossed structured clone. */
export interface ToolWorkerMetrics {
  requests: WebLlmRequest[];
  chunks: WebLlmChunk[];
  waiting: number;
  interrupts: number;
  drained: number;
  closed: boolean;
}

interface Reply {
  id: number;
  request?: WebLlmRequest;
  waiting?: boolean;
  result?: IteratorResult<WebLlmChunk>;
}

/** Installs only a controlled worker protocol, without loading a model runtime. */
export async function installWebLlmToolWorker(
  page: Page,
  mode: 'gated-done' | 'native-canary' = 'gated-done',
): Promise<void> {
  await page.addInitScript(
    ({ source, mode }) => {
      const url = URL.createObjectURL(
        new Blob([source], { type: 'application/javascript' }),
      );
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      const metrics: ToolWorkerMetrics = {
        requests: [],
        chunks: [],
        waiting: 0,
        interrupts: 0,
        drained: 0,
        closed: false,
      };
      let sequence = 0;
      const pending = new Map<number, (value: Reply) => void>();
      worker.onmessage = (event: MessageEvent<Reply>) => {
        if (event.data.waiting) {
          metrics.waiting++;
          return;
        }
        pending.get(event.data.id)?.(event.data);
        pending.delete(event.data.id);
      };
      const send = (message: object): Promise<Reply> =>
        new Promise((resolve) => {
          const id = ++sequence;
          pending.set(id, resolve);
          worker.postMessage({ ...message, id });
        });
      const engine: WebLlmEngine = {
        chat: {
          completions: {
            async create(request) {
              const ready = await send({ kind: 'create', request, mode });
              if (!ready.request)
                throw new Error('Worker did not return a cloned request.');
              metrics.requests.push(ready.request);
              return {
                [Symbol.asyncIterator]: () => ({
                  async next() {
                    const reply = await send({ kind: 'next' });
                    if (!reply.result)
                      throw new Error('Worker omitted iterator result.');
                    if (reply.result.done) metrics.drained++;
                    else metrics.chunks.push(reply.result.value);
                    return reply.result;
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
      Object.assign(globalThis, {
        __hashbrownWebLlm: engine,
        __localModelCalls: [],
        __localModelLifecycle: [],
        __toolWorker: metrics,
        __releaseToolWorker: () => worker.postMessage({ kind: 'release' }),
        __closeToolWorker: () => {
          worker.terminate();
          metrics.closed = true;
        },
      });
    },
    { source: `(${toolWorker.toString()})()`, mode },
  );
}

/** Controls only clone/iterator/cancel boundaries; it never imports WebLLM or performs inference. */
function toolWorker(): void {
  let step = 0;
  let released = false;
  let interrupted = false;
  let held: number | undefined;
  let content = '';
  let mode = '';
  const done = (id: number) =>
    globalThis.postMessage({ id, result: { done: true } });
  globalThis.onmessage = (
    event: MessageEvent<{
      kind: string;
      id: number;
      mode: string;
      request: WebLlmRequest;
    }>,
  ) => {
    const { kind, id, request } = event.data;
    if (kind === 'release') {
      released = true;
      if (held !== undefined) {
        done(held);
        held = undefined;
      }
    } else if (kind === 'interrupt') interrupted = true;
    else if (kind === 'create') {
      mode = event.data.mode;
      step = 0;
      interrupted = false;
      const schema = JSON.parse(request.response_format?.schema ?? '{}') as {
        properties: Record<string, unknown>;
      };
      const results = request.messages.flatMap((message) => {
        try {
          const value = JSON.parse(message.content) as {
            type: string;
            text: string;
          };
          return value.type === 'hashbrown.tool_result'
            ? [JSON.parse(value.text) as { token: string }]
            : [];
        } catch {
          return [];
        }
      });
      content = JSON.stringify(
        'record' in (schema.properties ?? {})
          ? { record: 'alpha' }
          : schema.properties
            ? { value: results.at(-1)?.token }
            : 'worker text',
      );
      globalThis.postMessage({ id, request });
    } else if (kind === 'next') {
      if (step++ === 0 && !interrupted)
        globalThis.postMessage({
          id,
          result: {
            done: false,
            value: {
              choices: [
                {
                  delta:
                    mode === 'native-canary'
                      ? {
                          tool_calls: [
                            {
                              id: 'native-canary',
                              type: 'function',
                              function: {
                                name: 'lookup_secret',
                                arguments: '{"record":"alpha"}',
                              },
                            },
                          ],
                        }
                      : { content },
                },
              ],
            },
          },
        });
      else if (step === 2 && !interrupted)
        globalThis.postMessage({
          id,
          result: {
            done: false,
            value: { choices: [{ delta: {}, finish_reason: 'stop' }] },
          },
        });
      else if (!released && mode === 'gated-done') {
        held = id;
        globalThis.postMessage({ id: 0, waiting: true });
      } else done(id);
    }
  };
}
