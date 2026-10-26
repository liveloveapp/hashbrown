import {
  type Chat,
  type ChromeToolPhase,
  type ChromeToolsTurnContext,
  experimental_chrome,
  experimental_chrome_tools,
  experimental_webllm,
  experimental_webllm_tools,
  type TransportFactory,
  type WebLlmEngine,
  type WebLlmImageContent,
  type WebLlmToolsTurnContext,
} from '@hashbrownai/core';

/** Selects a phase solely from the current canonical user turn and completed results. */
function selectUiToolPhase(
  context: ChromeToolsTurnContext | WebLlmToolsTurnContext,
  workflow: string | null,
): ChromeToolPhase {
  if (context.completedCalls.some((call) => call.result.type === 'error')) {
    throw new Error('Application tool phase refuses a failed tool result.');
  }
  if (
    workflow === 'no-tools' ||
    context.userMessage.content.startsWith('Without calling tools')
  ) {
    return { type: 'finalize' };
  }
  if (context.completedCalls.length === 0)
    return {
      type: 'tool',
      name:
        workflow === 'permission'
          ? 'protected_lookup'
          : workflow === 'error'
            ? 'error_tool'
            : 'lookup_secret',
    };
  if (workflow === 'dependent' && context.completedCalls.length === 1)
    return { type: 'tool', name: 'follow_secret' };
  return { type: 'finalize' };
}

/** Selects an explicitly requested local transport for the fixture hosts. */
export function readLocalTransport(): TransportFactory | undefined {
  const parameters = new URL(globalThis.location.href).searchParams;
  const name = parameters.get('localModel');
  if (
    name === 'chrome-tools' ||
    name === 'chrome-tools-schema' ||
    name === 'chrome-tools-phases'
  ) {
    const runtime = globalThis as unknown as {
      __hashbrownNativeTools: { created: number; destroyed: number };
    };
    runtime.__hashbrownNativeTools = { created: 0, destroyed: 0 };
    return experimental_chrome_tools({
      ...(name === 'chrome-tools-schema' || name === 'chrome-tools-phases'
        ? { schemaFinalization: 'after-tool-planning' as const }
        : {}),
      ...(name === 'chrome-tools-phases'
        ? {
            toolPhase: (context: ChromeToolsTurnContext) =>
              selectUiToolPhase(
                context,
                parameters.get('uiWorkflow') ??
                  (parameters.get('noTools') === 'true'
                    ? 'no-tools'
                    : 'lookup'),
              ),
          }
        : {}),
      timeoutMs: 120_000,
      events: {
        downloadRequired() {
          throw new Error(
            'Native tools require an already available model; download it separately.',
          );
        },
        sessionState(state) {
          runtime.__hashbrownNativeTools = {
            ...runtime.__hashbrownNativeTools,
            [state]: runtime.__hashbrownNativeTools[state] + 1,
          };
        },
      },
    });
  }
  if (name === 'webllm-tools') {
    const runtime = globalThis as unknown as {
      __hashbrownWebLlm?: WebLlmEngine;
      __webLlmToolContexts: unknown[];
      __webLlmToolCanonical: unknown[];
      __webLlmToolEvents: unknown[];
      __webLlmToolDisposed: number;
      __webLlmTextTransport: TransportFactory;
    };
    const engine = runtime.__hashbrownWebLlm;
    if (!engine)
      throw new Error(
        'The application must prepare a text WebLLM engine first.',
      );
    runtime.__webLlmToolContexts = [];
    runtime.__webLlmToolCanonical = [];
    runtime.__webLlmToolEvents = [];
    runtime.__webLlmToolDisposed = 0;
    runtime.__webLlmTextTransport = experimental_webllm({ engine });
    const factory = experimental_webllm_tools({
      engine,
      toolPhase(context) {
        runtime.__webLlmToolContexts = [
          ...runtime.__webLlmToolContexts,
          {
            ...context,
            frozen:
              Object.isFrozen(context) &&
              Object.isFrozen(context.userMessage) &&
              Object.isFrozen(context.completedCalls) &&
              context.completedCalls.every(
                (call) =>
                  Object.isFrozen(call) &&
                  Object.isFrozen(call.arguments) &&
                  Object.isFrozen(call.result),
              ),
          },
        ];
        return selectUiToolPhase(context, parameters.get('uiWorkflow'));
      },
    });
    return () => {
      const transport = factory();
      return {
        ...transport,
        async send(request) {
          runtime.__webLlmToolCanonical = [
            ...runtime.__webLlmToolCanonical,
            structuredClone(request.input),
          ];
          const response = await transport.send(request);
          return {
            ...response,
            events: {
              async *[Symbol.asyncIterator]() {
                for await (const event of response.events) {
                  runtime.__webLlmToolEvents = [
                    ...runtime.__webLlmToolEvents,
                    structuredClone(event),
                  ];
                  yield event;
                }
              },
            },
            async dispose() {
              await response.dispose?.();
              runtime.__webLlmToolDisposed++;
            },
          };
        },
      };
    };
  }
  if (name === 'chrome') {
    const modality = new URL(globalThis.location.href).searchParams.get(
      'localMedia',
    );
    if (modality !== 'image' && modality !== 'audio')
      return experimental_chrome();
    const runtime = globalThis as unknown as MediaFixtureRuntime;
    runtime.__hashbrownLocalMedia = {
      resolved: 0,
      released: 0,
      created: 0,
      destroyed: 0,
    };
    return experimental_chrome({
      media: {
        ...(modality === 'image' ? { images: {} } : { audio: {} }),
        resolve(part, { signal }) {
          signal.throwIfAborted();
          if (part.source.type !== 'data') {
            throw new Error('This fixture resolves inline media only.');
          }
          const bytes = Uint8Array.from(atob(part.source.value), (character) =>
            character.charCodeAt(0),
          );
          runtime.__hashbrownLocalMedia = {
            ...runtime.__hashbrownLocalMedia,
            resolved: runtime.__hashbrownLocalMedia.resolved + 1,
          };
          return {
            blob: new Blob([bytes], { type: part.source.mimeType }),
            dispose() {
              runtime.__hashbrownLocalMedia = {
                ...runtime.__hashbrownLocalMedia,
                released: runtime.__hashbrownLocalMedia.released + 1,
              };
            },
          };
        },
      },
      events: {
        downloadRequired() {
          throw new Error(
            'The media fixture requires an already available model; downloads are disabled.',
          );
        },
        sessionState(state) {
          if (state === 'created' || state === 'destroyed') {
            runtime.__hashbrownLocalMedia = {
              ...runtime.__hashbrownLocalMedia,
              [state]: runtime.__hashbrownLocalMedia[state] + 1,
            };
          }
        },
      },
    });
  }
  if (name === 'webllm' && parameters.get('localMedia') === 'image') {
    const engine = (
      globalThis as unknown as {
        __hashbrownWebLlm?: WebLlmEngine<WebLlmImageContent>;
      }
    ).__hashbrownWebLlm;
    if (!engine)
      throw new Error(
        'The application must prepare an image-capable WebLLM engine first.',
      );
    const runtime = globalThis as unknown as MediaFixtureRuntime;
    runtime.__hashbrownLocalMedia = {
      resolved: 0,
      released: 0,
      created: 0,
      destroyed: 0,
    };
    return experimental_webllm({
      engine,
      media: {
        images: {},
        resolve(part, { signal }) {
          signal.throwIfAborted();
          if (part.source.type !== 'data')
            throw new Error(
              'This fixture resolves generated inline images only.',
            );
          const bytes = Uint8Array.from(atob(part.source.value), (character) =>
            character.charCodeAt(0),
          );
          runtime.__hashbrownLocalMedia = {
            ...runtime.__hashbrownLocalMedia,
            resolved: runtime.__hashbrownLocalMedia.resolved + 1,
          };
          return {
            blob: new Blob([bytes], { type: part.source.mimeType }),
            dispose() {
              runtime.__hashbrownLocalMedia = {
                ...runtime.__hashbrownLocalMedia,
                released: runtime.__hashbrownLocalMedia.released + 1,
              };
            },
          };
        },
      },
    });
  }
  if (name === 'webllm') {
    const engine = (
      globalThis as unknown as { __hashbrownWebLlm?: WebLlmEngine }
    ).__hashbrownWebLlm;
    if (!engine)
      throw new Error('The application must prepare a WebLLM engine first.');
    return experimental_webllm({ engine });
  }
  return undefined;
}

interface MediaFixtureRuntime {
  __hashbrownSpeechBase64?: string;
  __hashbrownLocalMedia: {
    resolved: number;
    released: number;
    created: number;
    destroyed: number;
  };
}

/** Creates only generated inline media when the fixture's Send button is clicked. */
export function createLocalMediaContent(): Chat.UserMessageInput['content'] {
  const modality = new URL(globalThis.location.href).searchParams.get(
    'localMedia',
  );
  if (modality === 'audio') {
    const data = (globalThis as unknown as MediaFixtureRuntime)
      .__hashbrownSpeechBase64;
    if (!data)
      throw new Error(
        'The generated speech fixture must be installed by the local test.',
      );
    return [
      {
        type: 'text',
        text: 'Transcribe the speech exactly. Return only the words spoken, with no explanation.',
      },
      {
        type: 'audio',
        source: { type: 'data', value: data, mimeType: 'audio/wav' },
      },
    ];
  }
  if (modality !== 'image')
    throw new Error('Select the image or audio media fixture explicitly.');
  const parameters = new URL(globalThis.location.href).searchParams;
  const vision =
    parameters.get('localModel') === 'webllm' &&
    parameters.get('localVision') === '1';
  const color = parameters.get('visionColor');
  if (vision && color !== 'red' && color !== 'blue')
    throw new Error('Select a generated vision fixture color explicitly.');
  const canvas = document.createElement('canvas');
  canvas.width = vision ? 96 : 64;
  canvas.height = 64;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Canvas 2D context unavailable');
  drawing.fillStyle = vision ? '#ffffff' : '#ff0000';
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  if (vision) {
    drawing.fillStyle = color === 'red' ? '#ff0000' : '#0000ff';
    drawing.fillRect(12, 20, 24, 24);
    drawing.fillRect(60, 20, 24, 24);
  }
  const text = {
    type: 'text' as const,
    text: vision
      ? 'Identify the foreground square color in lowercase and count the foreground squares in the latest image. Return JSON with answer and count.'
      : 'What is the dominant color in this image? Reply with one color word only.',
  };
  const image = {
    type: 'image' as const,
    source: {
      type: 'data' as const,
      value: canvas.toDataURL('image/png').split(',')[1],
      mimeType: 'image/png',
    },
  };
  return new URL(globalThis.location.href).searchParams.get('localModel') ===
    'webllm'
    ? [image, text]
    : [text, image];
}
