import { EventSchema, RunAgentInputSchema } from '@ag-ui/core/schemas';
import { createWorkbenchStore, type WorkbenchSnapshot } from './workbench';
import { createWorkbenchLayoutStore } from './workbench-layout';
import { mountWorkbench } from './workbench-view';

/** The installed consumer whose runtime owns this transcript. */
export type ThreadplaneFramework = 'React' | 'Angular';

/** Options for observing an installed consumer's actual transport. */
export interface ThreadplaneCaptureOptions {
  readonly framework: ThreadplaneFramework;
  readonly origin: string;
  readonly fetch?: typeof globalThis.fetch;
}

const limit = 256_000;

/** Observes only same-origin chat POSTs while preserving bytes and consumer-driven cancellation. */
export function createThreadplaneCapture(options: ThreadplaneCaptureOptions) {
  const store = createWorkbenchStore('text');
  const upstream = options.fetch ?? globalThis.fetch.bind(globalThis);
  const observedFetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      options.origin,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (
      url.origin !== options.origin ||
      url.pathname !== '/api/chat' ||
      method !== 'POST'
    )
      return upstream(input, init);
    if (store.getSnapshot().cursor !== null)
      throw new Error('Live sends are disabled during replay.');
    const request =
      input instanceof Request
        ? new Request(input.clone(), init)
        : new Request(url, init);
    const body = await request.text();
    if (body.length > limit)
      throw new Error('Chat request exceeds capture limit.');
    const envelope: unknown = JSON.parse(body);
    const parsedInput = RunAgentInputSchema.safeParse(envelope);
    if (!parsedInput.success) throw new Error('Invalid AG-UI chat request.');
    const run = parsedInput.data;
    if (
      !run.runId ||
      run.runId.length > 120 ||
      !run.threadId ||
      run.threadId.length > 100 ||
      run.messages.length > 100
    )
      throw new Error('Invalid or oversized chat run identity.');
    const content = [...run.messages]
      .reverse()
      .find((message) => message.role === 'user')?.content;
    if (typeof content !== 'string')
      throw new Error('Chat request requires a user text message.');
    const user = store.send(content);
    const fresh = () => {
      const snapshot = store.getSnapshot();
      return (
        snapshot.cursor === null &&
        snapshot.status === 'loading' &&
        snapshot.frame?.messages
          .filter((message) => message.role === 'user')
          .at(-1)?.id === user.id
      );
    };
    const settle = (
      status: 'complete' | 'error' | 'cancelled',
      reason: string,
    ) => {
      if (fresh()) store.settle(status, reason);
    };
    store.record('request', { url: url.href, method, input: envelope });
    let response: Response;
    try {
      response = await upstream(input, init);
    } catch (error) {
      settle(
        request.signal.aborted ? 'cancelled' : 'error',
        'Transport failed',
      );
      throw error;
    }
    if (fresh())
      store.record('source', {
        source: response.headers.get('X-Workbench-Source') ?? 'unknown',
        framework: options.framework,
        runtime:
          options.framework === 'React'
            ? 'useChat'
            : 'provideAgent / injectAgent',
      });
    if (fresh())
      store.record('response', {
        status: response.status,
        statusText: response.statusText,
        url: url.href,
      });
    if (!response.ok || !response.body) {
      settle('error', `HTTP ${response.status}`);
      return response;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let count = 0;
    let terminal = false;
    let started = false;
    let messageId: string | null = null;
    const messageIds = new Set<string>();
    let invalid = false;
    const consume = (text: string, eof = false) => {
      count += text.length;
      if (count > limit) {
        invalid = true;
        pending = '';
        return;
      }
      pending += text;
      pending = pending.replace(/\r\n/g, '\n');
      const blocks = pending.split('\n\n');
      pending = blocks.pop() ?? '';
      if (eof && pending.trim()) {
        blocks.push(pending);
        pending = '';
      }
      for (const block of blocks) {
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        try {
          const raw: unknown = JSON.parse(data);
          const result = EventSchema.safeParse(raw);
          if (!result.success || terminal) {
            invalid = true;
            continue;
          }
          const event = result.data;
          if (event.type === 'RUN_STARTED') {
            if (
              started ||
              event.runId !== run.runId ||
              event.threadId !== run.threadId
            ) {
              invalid = true;
              continue;
            }
            started = true;
          } else if (!started) {
            invalid = true;
            continue;
          }
          if (
            event.type === 'RUN_FINISHED' &&
            (event.runId !== run.runId ||
              event.threadId !== run.threadId ||
              messageId !== null)
          ) {
            invalid = true;
            continue;
          }
          if (event.type === 'TEXT_MESSAGE_START') {
            if (
              messageId !== null ||
              messageIds.has(event.messageId) ||
              (event.role !== undefined && event.role !== 'assistant')
            ) {
              invalid = true;
              continue;
            }
            messageId = event.messageId;
            messageIds.add(messageId);
          }
          if (
            event.type === 'TEXT_MESSAGE_CONTENT' ||
            event.type === 'TEXT_MESSAGE_END'
          ) {
            if (messageId !== event.messageId) {
              invalid = true;
              continue;
            }
            if (event.type === 'TEXT_MESSAGE_END') messageId = null;
          }
          if (fresh()) store.record('event', raw);
          if (event.type === 'RUN_FINISHED') terminal = true;
          if (event.type === 'RUN_ERROR') invalid = true;
        } catch {
          invalid = true;
        }
      }
    };
    const onAbort = () =>
      settle(
        terminal && !invalid ? 'complete' : 'cancelled',
        terminal && !invalid ? 'stop' : 'Request aborted',
      );
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted) onAbort();
    const bodyStream = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const result = await reader.read();
            if (result.done) {
              consume(decoder.decode(), true);
              settle(
                terminal && !invalid ? 'complete' : 'error',
                terminal && !invalid
                  ? 'stop'
                  : 'Incomplete or malformed protocol stream',
              );
              request.signal.removeEventListener('abort', onAbort);
              reader.releaseLock();
              controller.close();
            } else {
              consume(decoder.decode(result.value, { stream: true }));
              controller.enqueue(result.value);
            }
          } catch (error) {
            settle(
              request.signal.aborted ? 'cancelled' : 'error',
              'Stream failed',
            );
            request.signal.removeEventListener('abort', onAbort);
            controller.error(error);
          }
        },
        async cancel(reason) {
          settle(
            terminal && !invalid ? 'complete' : 'cancelled',
            terminal && !invalid ? 'stop' : 'Consumer cancelled',
          );
          request.signal.removeEventListener('abort', onAbort);
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(bodyStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return { store, fetch: observedFetch, framework: options.framework };
}

/** Projects captured protocol and plain text without inventing parsed plan or UI props. */
export function threadplaneInspection(
  tab: string,
  snapshot: WorkbenchSnapshot,
  framework: ThreadplaneFramework,
) {
  const frame = snapshot.frame;
  const visible = snapshot.events.slice(
    0,
    (snapshot.cursor ?? snapshot.events.length - 1) + 1,
  );
  const protocol = visible
    .filter((event) => event.kind === 'event' && event.turn === frame?.turn)
    .map((event) => event.payload);
  const views: Record<
    string,
    { heading: string; value: unknown; detailHeading: string; detail: unknown }
  > = {
    JSON: {
      heading: 'Captured protocol events',
      value: protocol,
      detailHeading: 'Actual source envelope',
      detail: frame?.payload ?? null,
    },
    Text: {
      heading: 'Streamed text',
      value: frame?.json ?? '',
      detailHeading: 'Text stream outcome',
      detail: { status: frame?.status ?? snapshot.status, parsedPlan: false },
    },
    UI: {
      heading: 'Threadplane transcript and composer',
      value: {
        framework,
        components:
          framework === 'React'
            ? ['TextTranscript', 'ChatInput']
            : ['ChatComponent'],
        runtime:
          framework === 'React'
            ? 'Hashbrown useChat'
            : 'AG-UI provideAgent / injectAgent',
      },
      detailHeading: 'Runtime ownership',
      detail: {
        text: frame?.json ?? '',
        generatedComponents: false,
        applicationWrites: false,
      },
    },
    State: {
      heading: 'Application state · unchanged',
      value: frame?.application ?? snapshot.application,
      detailHeading: 'Plain text does not apply a plan',
      detail: { applicationWrites: false, acceptance: false },
    },
  };
  return views[tab];
}

/** Moves an existing framework mount into the canonical shell; it may be called before framework bootstrap. */
export function mountThreadplaneWorkbench(
  host: HTMLElement,
  app: HTMLElement,
  capture: ReturnType<typeof createThreadplaneCapture>,
) {
  const shell = mountWorkbench(
    host,
    capture.store,
    {
      framework: capture.framework,
      lesson: {
        id: 'threadplane',
        title: 'Threadplane',
        format: 'text',
        inspector: 'Text',
        endpoint: '/api/chat',
      },
      send: () => undefined,
      stop: () => undefined,
      reset: () => undefined,
    },
    {
      layout: createWorkbenchLayoutStore(),
      externalComposer: true,
      plainTextReplay: true,
      inspectorTabs: ['JSON', 'Text', 'Requests', 'UI', 'State'],
      inspection: (tab, snapshot) =>
        threadplaneInspection(tab, snapshot, capture.framework),
      disableNewConversation: true,
      fixedSidebarTopic: 'Threadplane',
    },
  );
  app.classList.add('wb-threadplane-app');
  shell.live.append(app);
  return shell;
}
