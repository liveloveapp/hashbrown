import {
  type Chat,
  experimental_chrome,
  experimental_webllm,
  type TransportFactory,
  type WebLlmEngine,
} from '@hashbrownai/core';

/** Selects an explicitly requested local transport for the fixture hosts. */
export function readLocalTransport(): TransportFactory | undefined {
  const name = new URL(globalThis.location.href).searchParams.get('localModel');
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
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Canvas 2D context unavailable');
  drawing.fillStyle = '#ff0000';
  drawing.fillRect(0, 0, 64, 64);
  return [
    {
      type: 'text',
      text: 'What is the dominant color in this image? Reply with one color word only.',
    },
    {
      type: 'image',
      source: {
        type: 'data',
        value: canvas.toDataURL('image/png').split(',')[1],
        mimeType: 'image/png',
      },
    },
  ];
}
