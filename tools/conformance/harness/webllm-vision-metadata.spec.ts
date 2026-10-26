import { summarizeWebLlmImages } from '../local-models/webllm-runtime';

test('records only image MIME/count/byte metadata without serializing URLs, bytes or prompt text', () => {
  const request = {
    stream: true as const,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: 'data:image/png;base64,c2VjcmV0' },
          },
          { type: 'text' as const, text: 'private prompt' },
        ],
      },
    ],
  };

  const result = summarizeWebLlmImages(request);

  expect(result).toEqual({
    imageCount: 1,
    totalBytes: 6,
    images: [{ mime: 'image/png', bytes: 6 }],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /c2VjcmV0|secret|data:|private prompt/,
  );
});
