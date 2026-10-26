import type { Page } from '@playwright/test';

/** Bridges aimock SSE to Chrome's typed native tool stream without executing tools. */
export async function installNativeToolShim(
  page: Page,
  url: string,
  validIds = false,
  holdFinalAfter?: string,
): Promise<void> {
  await page.addInitScript(
    ({ url, validIds, holdFinalAfter }) => {
      type Init = {
        callID: string;
        name: string;
        arguments?: unknown;
        result?: { type: string; value: string }[];
        errorMessage?: string;
      };
      class LanguageModelToolCall {
        constructor(private readonly init: Init) {}
        get callID() {
          return this.init.callID;
        }
        get name() {
          return this.init.name;
        }
        get arguments() {
          return this.init.arguments;
        }
      }
      class LanguageModelToolSuccess {
        constructor(private readonly init: Init) {}
        get callID() {
          return this.init.callID;
        }
        get name() {
          return this.init.name;
        }
        get result() {
          return this.init.result;
        }
      }
      class LanguageModelToolError {
        constructor(private readonly init: Init) {}
        get callID() {
          return this.init.callID;
        }
        get name() {
          return this.init.name;
        }
        get errorMessage() {
          return this.init.errorMessage;
        }
      }
      type Part = { type: string; value: string | Init };
      type Prompt = { role: string; content: string | Part[] };
      const requests: unknown[] = [];
      const canonical: unknown[] = [];
      const lifecycle: string[] = [];
      let active = 0;
      const model = {
        async availability(options: { tools: unknown }) {
          void options.tools;
          lifecycle.push('availability');
          return 'available';
        },
        async create(options: {
          initialPrompts: Prompt[];
          tools: { name: string; description: string; inputSchema: object }[];
        }) {
          if (options.initialPrompts.some((prompt) => prompt.role !== 'system'))
            throw new TypeError(
              'Only system prompts belong in native initialPrompts',
            );
          lifecycle.push('created');
          const owned = new AbortController();
          let destroyed = false;
          let history = [...options.initialPrompts];
          return {
            promptStreaming(
              prompts: Prompt[],
              options2: { signal: AbortSignal; responseConstraint?: object },
            ) {
              if (prompts.some((prompt) => prompt.role === 'system'))
                throw new TypeError('System prompts belong in initialPrompts');
              const all = [...history, ...prompts];
              history = all;
              const messages: object[] = [];
              canonical.push(
                all.map((p) => ({
                  role: p.role,
                  content:
                    typeof p.content === 'string'
                      ? p.content
                      : p.content.map((part) => ({
                          type: part.type,
                          value:
                            typeof part.value === 'string'
                              ? part.value
                              : {
                                  callID: part.value.callID,
                                  name: part.value.name,
                                  arguments: part.value.arguments,
                                  result: part.value.result,
                                  errorMessage: part.value.errorMessage,
                                },
                        })),
                })),
              );
              for (const prompt of all) {
                if (typeof prompt.content === 'string') {
                  messages.push(prompt);
                  continue;
                }
                const toolCalls: object[] = [];
                const text: string[] = [];
                for (const part of prompt.content) {
                  if (part.type === 'text') {
                    text.push(String(part.value));
                    continue;
                  }
                  const value = part.value as Init;
                  if (part.type === 'tool-call') {
                    if (!(value instanceof LanguageModelToolCall))
                      throw new TypeError(
                        'Native history calls must use the typed constructor',
                      );
                    toolCalls.push({
                      id: value.callID,
                      type: 'function',
                      function: {
                        name: value.name,
                        arguments: JSON.stringify(value.arguments),
                      },
                    });
                  } else {
                    if (
                      ![LanguageModelToolSuccess, LanguageModelToolError].some(
                        (Constructor) => value instanceof Constructor,
                      )
                    )
                      throw new TypeError(
                        'Native results must use typed success/error constructors',
                      );
                    messages.push({
                      role: 'tool',
                      tool_call_id: value.callID,
                      name: value.name,
                      content:
                        value.errorMessage ??
                        value.result?.map((p) => p.value).join(''),
                      ...(value.errorMessage !== undefined
                        ? { error: value.errorMessage }
                        : {}),
                    });
                  }
                }
                if (toolCalls.length || text.length)
                  messages.push({
                    role: prompt.role,
                    content: text.join(''),
                    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
                  });
              }
              const request = {
                model: 'native-tools-fixture',
                stream: true,
                messages,
                ...(options2.responseConstraint
                  ? {
                      response_format: {
                        type: 'json_schema',
                        json_schema: {
                          name: 'native_final_answer',
                          schema: options2.responseConstraint,
                        },
                      },
                    }
                  : {}),
                tools: options.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
              };
              requests.push(request);
              const signal = AbortSignal.any([owned.signal, options2.signal]);
              async function* generate(): AsyncGenerator<unknown> {
                active++;
                lifecycle.push('stream-started');
                let reader: ReadableStreamDefaultReader<string> | undefined;
                try {
                  const response = await fetch(`${url}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(request),
                    signal,
                  });
                  if (!response.ok || !response.body)
                    throw new Error(`aimock HTTP ${response.status}`);
                  reader = response.body
                    .pipeThrough(new TextDecoderStream())
                    .getReader();
                  const calls = new Map<
                    number,
                    { id: string; name: string; arguments: string }
                  >();
                  let buffer = '';
                  let text = '';
                  while (true) {
                    const next = await reader.read();
                    if (next.done) break;
                    buffer += next.value;
                    let newline: number;
                    while ((newline = buffer.indexOf('\n')) >= 0) {
                      const line = buffer.slice(0, newline).trim();
                      buffer = buffer.slice(newline + 1);
                      if (!line.startsWith('data:')) continue;
                      const data = line.slice(5).trim();
                      if (data === '[DONE]') break;
                      const chunk = JSON.parse(data) as {
                        choices: {
                          delta: {
                            content?: string;
                            tool_calls?: {
                              index: number;
                              id?: string;
                              function?: { name?: string; arguments?: string };
                            }[];
                          };
                        }[];
                      };
                      for (const choice of chunk.choices) {
                        if (choice.delta.content) {
                          text += choice.delta.content;
                          yield choice.delta.content;
                          if (
                            options2.responseConstraint &&
                            holdFinalAfter &&
                            text.includes(holdFinalAfter)
                          ) {
                            await new Promise<void>((resolve) => {
                              const release = () => {
                                signal.removeEventListener('abort', release);
                                resolve();
                              };
                              Object.assign(globalThis, {
                                __nativeToolReleaseFinal: release,
                              });
                              signal.addEventListener('abort', release, {
                                once: true,
                              });
                              if (signal.aborted) release();
                            });
                            holdFinalAfter = undefined;
                          }
                        }
                        for (const call of choice.delta.tool_calls ?? []) {
                          const previous = calls.get(call.index) ?? {
                            id: '',
                            name: '',
                            arguments: '',
                          };
                          calls.set(call.index, {
                            id: call.id ?? previous.id,
                            name: previous.name + (call.function?.name ?? ''),
                            arguments:
                              previous.arguments +
                              (call.function?.arguments ?? ''),
                          });
                        }
                      }
                    }
                  }
                  const parts: Part[] = text
                    ? [{ type: 'text', value: text }]
                    : [];
                  for (const call of calls.values()) {
                    const value = new LanguageModelToolCall({
                      callID: validIds ? call.id : '',
                      name: call.name,
                      arguments: JSON.parse(call.arguments),
                    });
                    parts.push({ type: 'tool-call', value });
                    yield {
                      type: 'tool-call',
                      value,
                    };
                  }
                  if (!signal.aborted)
                    history = [
                      ...history,
                      { role: 'assistant', content: parts },
                    ];
                } finally {
                  await reader?.cancel().catch(() => undefined);
                  reader?.releaseLock();
                  active--;
                  lifecycle.push('stream-settled');
                }
              }
              const iterator = generate();
              return new ReadableStream({
                async pull(controller) {
                  try {
                    const next = await iterator.next();
                    if (next.done) controller.close();
                    else controller.enqueue(next.value);
                  } catch (error) {
                    controller.error(error);
                  }
                },
                async cancel() {
                  owned.abort();
                  await iterator.return(undefined);
                },
              });
            },
            destroy() {
              if (!destroyed) {
                destroyed = true;
                lifecycle.push('destroyed');
                owned.abort();
              }
            },
          };
        },
      };
      Object.assign(globalThis, {
        LanguageModel: model,
        LanguageModelToolCall,
        LanguageModelToolSuccess,
        LanguageModelToolError,
        __nativeToolRequests: requests,
        __nativeToolCanonical: canonical,
        __nativeToolLifecycle: lifecycle,
        __nativeToolActive: () => active,
      });
    },
    { url, validIds, holdFinalAfter },
  );
}

/** Observes the real native boundary without replacing constructors or model inference. */
export async function installNativeToolObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Prompt = {
      role: string;
      content: string | { type: string; value: unknown }[];
    };
    type Session = {
      promptStreaming(
        input: Prompt[],
        options: object,
      ): ReadableStream<unknown>;
      destroy(): void;
    };
    const runtime = globalThis as unknown as {
      LanguageModel?: { create(options: object): Promise<Session> };
      __nativeToolNativeEvents?: object[];
      __nativeToolActive?: () => number;
    };
    const events: object[] = [];
    runtime.__nativeToolNativeEvents = events;
    const active = new Set<number>();
    runtime.__nativeToolActive = () => active.size;
    const model = runtime.LanguageModel;
    if (!model) return;
    const record = (value: object) =>
      events.push({ at: performance.now(), ...value });
    const serialize = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map(serialize);
      const object = value as Record<string, unknown>;
      const keys = new Set([
        ...Object.keys(object),
        ...[
          'callID',
          'callId',
          'name',
          'arguments',
          'result',
          'errorMessage',
        ].filter((key) => key in object),
      ]);
      return Object.fromEntries(
        [...keys].map((key) => [key, serialize(object[key])]),
      );
    };
    const create = model.create.bind(model);
    let nextSessionId = 0;
    model.create = async (options) => {
      const sessionId = ++nextSessionId;
      const recordSession = (value: object) => record({ sessionId, ...value });
      recordSession({
        phase: 'create-start',
        options: serialize(options),
        activation: navigator.userActivation.isActive,
        userAgent: navigator.userAgent,
      });
      const session = await create(options);
      recordSession({ phase: 'created' });
      return {
        promptStreaming(input, promptOptions) {
          active.add(sessionId);
          recordSession({
            phase: 'prompt',
            input: serialize(input),
            options: serialize(promptOptions),
          });
          const reader = session
            .promptStreaming(input, promptOptions)
            .getReader();
          return new ReadableStream({
            async pull(controller) {
              try {
                const next = await reader.read();
                if (next.done) {
                  active.delete(sessionId);
                  recordSession({ phase: 'stream-settled' });
                  reader.releaseLock();
                  controller.close();
                } else {
                  recordSession({
                    phase: 'chunk',
                    value: serialize(next.value),
                  });
                  controller.enqueue(next.value);
                }
              } catch (error) {
                active.delete(sessionId);
                recordSession({ phase: 'stream-error', error: String(error) });
                controller.error(error);
              }
            },
            async cancel() {
              try {
                await reader.cancel();
              } finally {
                active.delete(sessionId);
                reader.releaseLock();
                recordSession({ phase: 'stream-cancelled' });
              }
            },
          });
        },
        destroy() {
          recordSession({ phase: 'destroyed' });
          session.destroy();
        },
      };
    };
  });
}
