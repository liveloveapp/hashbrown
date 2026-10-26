import { test as base, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const downloadAllowed = process.env['LOCAL_LLM_DOWNLOAD'] === '1';
const normalizeEmptyToolIds =
  process.env['LOCAL_LLM_TOOL_ID_NORMALIZATION'] === '1';
const createTimeoutMs = downloadAllowed ? 1_200_000 : 180_000;
const generationTimeoutMs = 180_000;

const test = base.extend({
  context: async ({ playwright, baseURL, launchOptions }, use) => {
    const context = await playwright.chromium.launchPersistentContext(
      process.env['LOCAL_LLM_PROFILE'] ??
        join(tmpdir(), 'hashbrown-native-tools-model-profile'),
      { ...launchOptions, channel: 'chrome', headless: false, baseURL },
    );
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

for (const mode of ['success', 'error', 'history', 'history-error'] as const) {
  test(`native typed tools ${mode} round trip returns the exact hidden token`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(
      createTimeoutMs * (mode.startsWith('history') ? 2 : 1) + 600_000,
    );
    const secret = `hb-${randomBytes(16).toString('hex')}`;
    const events: unknown[] = [];
    const report: Record<string, unknown> = {
      scope: normalizeEmptyToolIds
        ? 'Raw native compatibility probe: application-generated IDs replace empty native IDs; no Hashbrown transport or public adapter.'
        : 'Strict raw native inference; no Hashbrown transport or framework adapter.',
      mode,
      project: testInfo.project.name,
      browserVersion: page.context().browser()?.version(),
      profile:
        process.env['LOCAL_LLM_PROFILE'] ??
        join(tmpdir(), 'hashbrown-native-tools-model-profile'),
      flags: testInfo.project.use.launchOptions?.args,
      downloadAllowed,
      normalizeEmptyToolIds,
      createTimeoutMs,
      generationTimeoutMs,
      events,
    };

    try {
      await page.exposeFunction(
        'recordNativeToolEvidence',
        (event: unknown) => {
          events.push(event);
        },
      );
      await page.goto('/?runUrl=http://127.0.0.1/unused&localModel=chrome');
      await page.evaluate(
        async ({
          mode,
          secret,
          downloadAllowed,
          normalizeEmptyToolIds,
          createTimeoutMs,
          generationTimeoutMs,
        }) => {
          interface ToolValue {
            callID?: string;
            callId?: string;
            name: string;
            arguments?: unknown;
            result?: unknown;
            errorMessage?: string;
          }
          type Constructor = new (options: object) => ToolValue;
          interface Session {
            promptStreaming(
              input: unknown,
              options: object,
            ): ReadableStream<unknown>;
            destroy(): void;
          }
          const runtime = globalThis as unknown as {
            LanguageModel?: {
              availability(options: object): Promise<string>;
              create(options: object): Promise<Session>;
            };
            LanguageModelToolCall?: Constructor;
            LanguageModelToolSuccess?: Constructor;
            LanguageModelToolError?: Constructor;
            recordNativeToolEvidence(event: unknown): Promise<void>;
            nativeToolRun?: Promise<object>;
          };
          const emit = (event: object) =>
            runtime.recordNativeToolEvidence({
              at: performance.now(),
              ...event,
            });
          const text = { type: 'text', languages: ['en'] };
          const options = {
            expectedInputs: [
              text,
              { type: 'tool-call' },
              { type: 'tool-response' },
            ],
            expectedOutputs: [text, { type: 'tool-call' }],
            tools: [
              {
                name: 'lookup_secret',
                description:
                  'Read the hidden token for record alpha. Never guess the token.',
                inputSchema: {
                  type: 'object',
                  properties: { record: { type: 'string', enum: ['alpha'] } },
                  required: ['record'],
                  additionalProperties: false,
                },
              },
            ],
          };

          if (!runtime.LanguageModel)
            throw new Error('Missing native LanguageModel');
          let toolsGetterRead = false;
          const probe = { ...options };
          Object.defineProperty(probe, 'tools', {
            get() {
              toolsGetterRead = true;
              return options.tools;
            },
          });
          const availability = await bounded(
            runtime.LanguageModel.availability(probe),
            generationTimeoutMs,
          );
          await emit({
            phase: 'availability',
            availability,
            toolsGetterRead,
            options,
            userAgent: navigator.userAgent,
          });
          if (!toolsGetterRead)
            throw new Error('Native tools declarations were ignored');
          if (
            !(
              downloadAllowed
                ? ['available', 'downloadable', 'downloading']
                : ['available']
            ).includes(availability)
          ) {
            throw new Error(
              `Native tools unavailable without permitted download: ${availability}`,
            );
          }
          for (const spelling of ['callID', 'callId']) {
            for (const [name, Constructor, fields] of [
              [
                'call',
                runtime.LanguageModelToolCall,
                { arguments: { record: 'alpha' } },
              ],
              [
                'success',
                runtime.LanguageModelToolSuccess,
                { result: [{ type: 'text', value: 'synthetic' }] },
              ],
              [
                'error',
                runtime.LanguageModelToolError,
                { errorMessage: 'synthetic' },
              ],
            ] as const) {
              try {
                if (!Constructor) throw new Error('Missing constructor');
                const value = new Constructor({
                  [spelling]: 'synthetic-call',
                  name: 'lookup_secret',
                  ...fields,
                });
                await emit({
                  phase: 'constructor-spelling',
                  name,
                  spelling,
                  callID: value.callID,
                  callId: value.callId,
                });
              } catch (cause) {
                const failure = cause as Error;
                await emit({
                  phase: 'constructor-spelling',
                  name,
                  spelling,
                  error: { name: failure.name, message: failure.message },
                });
              }
            }
          }
          const button = document.createElement('button');
          button.textContent = 'Run raw native tool canary';
          document.body.append(button);
          button.onclick = () => {
            // Creation starts directly inside a trusted Playwright click handler.
            runtime.nativeToolRun = run();
          };

          /** Bound a native operation even when the implementation ignores abort. */
          async function bounded<T>(
            operation: Promise<T>,
            milliseconds: number,
          ): Promise<T> {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              return await Promise.race([
                operation,
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error('Native operation timed out')),
                    milliseconds,
                  );
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          }

          /** Run one native scenario while preserving partial evidence on failure. */
          async function run() {
            const activeAtClick = navigator.userActivation.isActive;
            const owned = new Set<Session>();
            let acquired = 0;
            let destroyed = 0;
            const started = performance.now();
            const system = {
              role: 'system',
              content:
                'Always call lookup_secret to read a requested token. After a tool response return exactly its text value. If the tool fails return exactly its errorMessage. Never add explanations, quotes, or formatting.',
            };
            const request = {
              role: 'user',
              content:
                'Use lookup_secret to read record alpha. Return exactly the token from its result, or exactly the errorMessage if it fails.',
            };
            const destroy = (session: Session) => {
              if (owned.delete(session)) {
                session.destroy();
                destroyed++;
              }
            };
            const create = async (initialPrompts: object[]) => {
              let expired = false;
              const activeAtCreate = navigator.userActivation.isActive;
              if (downloadAllowed && acquired === 0 && !activeAtCreate) {
                throw new Error(
                  'Download-enabled creation requires active user activation',
                );
              }
              void emit({ phase: 'create-start', activeAtCreate });
              const languageModel = runtime.LanguageModel;
              if (!languageModel)
                throw new Error('Missing native LanguageModel');
              const operation = languageModel
                .create({
                  ...options,
                  initialPrompts,
                  signal: AbortSignal.timeout(createTimeoutMs),
                  monitor(monitor: EventTarget) {
                    monitor.addEventListener('downloadprogress', (event) => {
                      const progress = event as Event & {
                        loaded?: number;
                        total?: number;
                      };
                      void emit({
                        phase: 'download',
                        loaded: progress.loaded,
                        total: progress.total,
                      });
                    });
                  },
                })
                .then((session) => {
                  acquired++;
                  owned.add(session);
                  if (expired) destroy(session);
                  return session;
                });
              try {
                const session = await bounded(operation, createTimeoutMs);
                await emit({
                  phase: 'created',
                  acquired,
                  elapsedMs: performance.now() - started,
                });
                return session;
              } catch (error) {
                expired = true;
                throw error;
              }
            };
            const turn = async (
              session: Session,
              input: unknown,
              phase: string,
            ) => {
              const controller = new AbortController();
              const reader = session
                .promptStreaming(input, { signal: controller.signal })
                .getReader();
              const timer = setTimeout(
                () => controller.abort(),
                generationTimeoutMs,
              );
              const calls: ToolValue[] = [];
              const parts: string[] = [];
              const ordered: (
                | { type: 'text'; value: string }
                | { type: 'tool-call'; value: ToolValue }
              )[] = [];
              const turnStarted = performance.now();
              try {
                for (;;) {
                  const next = await bounded(
                    reader.read(),
                    Math.max(
                      1,
                      generationTimeoutMs - (performance.now() - turnStarted),
                    ),
                  );
                  if (next.done) break;
                  const chunk = next.value;
                  if (typeof chunk === 'string') {
                    parts.push(chunk);
                    ordered.push({ type: 'text', value: chunk });
                    await emit({
                      phase,
                      chunk: { type: 'text', value: chunk },
                    });
                  } else if (
                    chunk &&
                    typeof chunk === 'object' &&
                    'type' in chunk &&
                    chunk.type === 'tool-call' &&
                    'value' in chunk
                  ) {
                    const value = chunk.value as ToolValue;
                    calls.push(value);
                    ordered.push({ type: 'tool-call', value });
                    await emit({
                      phase,
                      chunk: {
                        type: 'tool-call',
                        value: {
                          callID: value.callID,
                          callId: value.callId,
                          name: value.name,
                          arguments: value.arguments,
                        },
                      },
                    });
                  } else {
                    await emit({ phase, unexpectedChunk: chunk });
                    throw new Error('Unexpected native stream chunk');
                  }
                }
                return { text: parts.join(''), calls, ordered };
              } finally {
                clearTimeout(timer);
                controller.abort();
                void reader.cancel().catch(() => undefined);
                reader.releaseLock();
              }
            };
            try {
              void emit({
                phase: 'start',
                activeAtClick,
                options,
                userAgent: navigator.userAgent,
              });
              if (!activeAtClick)
                throw new Error('Missing actual user activation');
              if (
                !runtime.LanguageModel ||
                !runtime.LanguageModelToolCall ||
                !runtime.LanguageModelToolSuccess ||
                !runtime.LanguageModelToolError
              ) {
                throw new Error('Missing native typed tool constructors');
              }
              const session = await create([system]);
              const first = await turn(session, [request], 'call');
              if (first.calls.length !== 1)
                throw new Error('Expected exactly one typed native call');
              const call = first.calls[0];
              const rawID =
                call.callId !== undefined ? call.callId : call.callID;
              // This opt-in experiment preserves native evidence and tests whether
              // a stable application-owned ID survives both response and replay.
              const id =
                normalizeEmptyToolIds && rawID === ''
                  ? crypto.randomUUID()
                  : rawID;
              await emit({
                phase: 'call-identity',
                normalizationEnabled: normalizeEmptyToolIds,
                rawID,
                canonicalID: id,
                normalized: rawID === '' && normalizeEmptyToolIds,
              });
              const args = call.arguments;
              if (
                typeof id !== 'string' ||
                !id.trim() ||
                call.name !== 'lookup_secret' ||
                !args ||
                typeof args !== 'object' ||
                Array.isArray(args) ||
                Object.keys(args).length !== 1 ||
                !('record' in args) ||
                args.record !== 'alpha'
              ) {
                throw new Error(
                  'Native call has invalid ID, name, or object arguments',
                );
              }
              const identity = { callID: id, callId: id, name: call.name };
              const response = mode.endsWith('error')
                ? new runtime.LanguageModelToolError({
                    ...identity,
                    errorMessage: secret,
                  })
                : new runtime.LanguageModelToolSuccess({
                    ...identity,
                    result: [{ type: 'text', value: secret }],
                  });
              if (
                (response.callId ?? response.callID) !== id ||
                response.name !== call.name
              )
                throw new Error('Native response lost call identity');
              const resultPrompt = {
                role: 'user',
                content: [{ type: 'tool-response', value: response }],
              };
              await emit({
                phase: 'application-response',
                identity,
                kind: mode.endsWith('error') ? 'error' : 'success',
                secret,
              });
              const second = await turn(session, [resultPrompt], 'result');
              if (second.calls.length || second.text !== secret)
                throw new Error(
                  'Native final text does not exactly match the hidden response token',
                );
              if (mode.startsWith('history')) {
                const typedCall = new runtime.LanguageModelToolCall({
                  ...identity,
                  arguments: args,
                });
                if (
                  (typedCall.callId ?? typedCall.callID) !== id ||
                  typedCall.name !== call.name
                )
                  throw new Error('Native history call lost identity');
                destroy(session);
                const history = [
                  system,
                  request,
                  {
                    role: 'assistant',
                    content: first.ordered.map((part) =>
                      part.type === 'text'
                        ? part
                        : { type: 'tool-call', value: typedCall },
                    ),
                  },
                  resultPrompt,
                ];
                await emit({
                  phase: 'history',
                  roles: history.map((prompt) => prompt.role),
                  assistantParts: first.ordered.map((part) =>
                    part.type === 'text'
                      ? part
                      : {
                          type: 'tool-call',
                          value: { ...identity, arguments: args },
                        },
                  ),
                  call: { ...identity, arguments: args },
                  response: {
                    ...identity,
                    ...(mode.endsWith('error')
                      ? { errorMessage: secret }
                      : { result: [{ type: 'text', value: secret }] }),
                  },
                  expectedInputs: options.expectedInputs,
                });
                const fresh = await create([system]);
                const replay = await turn(fresh, history.slice(1), 'replay');
                if (replay.calls.length || replay.text !== secret)
                  throw new Error(
                    'Fresh-session typed history did not preserve the exact tool token',
                  );
              }
              return {
                passed: true,
                activeAtClick,
                elapsedMs: performance.now() - started,
              };
            } catch (cause) {
              const failure = cause as Error;
              await emit({
                phase: 'failure',
                name: failure.name,
                message: failure.message,
              });
              return {
                passed: false,
                error: { name: failure.name, message: failure.message },
              };
            } finally {
              for (const session of owned) destroy(session);
              await emit({
                phase: 'cleanup',
                acquired,
                destroyed,
                elapsedMs: performance.now() - started,
              });
            }
          }
        },
        {
          mode,
          secret,
          downloadAllowed,
          normalizeEmptyToolIds,
          createTimeoutMs,
          generationTimeoutMs,
        },
      );

      await page
        .getByRole('button', {
          name: 'Run raw native tool canary',
          exact: true,
        })
        .click();
      const result = await page.evaluate(async () => {
        return await (
          globalThis as unknown as { nativeToolRun: Promise<object> }
        ).nativeToolRun;
      });
      report['result'] = result;

      expect(result, JSON.stringify(report, null, 2)).toMatchObject({
        passed: true,
      });
      const cleanup = events.at(-1) as {
        phase: string;
        acquired: number;
        destroyed: number;
      };
      expect(cleanup.phase).toBe('cleanup');
      expect(cleanup.acquired).toBe(mode.startsWith('history') ? 2 : 1);
      expect(cleanup.destroyed).toBe(cleanup.acquired);
    } catch (cause) {
      const failure = cause as Error;
      report['failure'] = { name: failure.name, message: failure.message };
      throw cause;
    } finally {
      await testInfo.attach(`native-tool-${mode}-roundtrip.json`, {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
