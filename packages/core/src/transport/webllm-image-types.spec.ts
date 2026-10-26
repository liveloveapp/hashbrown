import {
  experimental_webllm,
  type ExperimentalWebLlmImageTransportOptions,
  type WebLlmEngine,
  type WebLlmImageContent,
  type WebLlmRequest,
} from './experimental-webllm-transport';

/** Compile-only consumer controls also checked by ts-jest. */
function checkContracts(
  text: WebLlmEngine,
  images: WebLlmEngine<WebLlmImageContent>,
  media: ExperimentalWebLlmImageTransportOptions['media'],
) {
  experimental_webllm({ engine: text });
  experimental_webllm({ engine: images, media });
  // @ts-expect-error Text-only engines cannot opt into image requests.
  experimental_webllm({ engine: text, media });
  const variable = { engine: text, media };
  // @ts-expect-error Variables cannot bypass the image-engine overload.
  experimental_webllm(variable);
  const defaults = (request: WebLlmRequest): string =>
    request.messages.map((message) => message.content.toUpperCase()).join('');
  const imageContent: WebLlmImageContent = [
    { type: 'image_url', image_url: { url: 'x' } },
  ];
  const invalid: WebLlmRequest<WebLlmImageContent> = {
    stream: true,
    messages: [
      // @ts-expect-error Images remain user-only in the structural protocol.
      { role: 'assistant', content: imageContent },
    ],
  };
  return [defaults, invalid];
}

test('retains strict text defaults and explicit image engine contracts', () => {
  expect(typeof checkContracts).toBe('function');
});
