import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeFrame, type Frame } from '@hashbrownai/core';
import type { AimockHandle } from './aimock-runner';
import { runProviderTextWithAimock } from './provider-e2e';

async function* openAiCompatibleTextStream(
  aimock: AimockHandle,
): AsyncIterable<Uint8Array> {
  const response = await fetch(`${aimock.openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-not-used',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      stream: true,
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a deterministic test assistant.',
        },
        {
          role: 'user',
          content: 'say hi briefly',
        },
      ],
    }),
  });

  if (!response.body) {
    throw new Error('aimock did not return a response body.');
  }

  yield encodeFrame({ type: 'generation-start' });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('');

      if (!data || data === '[DONE]') {
        continue;
      }

      const chunk = JSON.parse(data) as {
        choices: [{ delta: { content?: string } }];
      };

      yield encodeFrame({
        type: 'generation-chunk',
        chunk: {
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.choices[0].delta.content ?? '',
              },
              finishReason: null,
            },
          ],
        },
      });
    }
  }

  yield encodeFrame({ type: 'generation-finish' });
}

test('runProviderTextWithAimock collects Hashbrown frames from an aimock-backed provider stream', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-provider-e2e-'));
  const fixturePath = join(workDir, 'text.json');
  writeFileSync(
    fixturePath,
    JSON.stringify({
      fixtures: [
        {
          match: { userMessage: 'say hi briefly' },
          response: { content: 'Hello from aimock.' },
        },
      ],
    }),
  );

  try {
    const frames: Frame[] = await runProviderTextWithAimock({
      fixturePath,
      createStream: openAiCompatibleTextStream,
    });

    expect(frames[0].type).toBe('generation-start');
    expect(frames.at(-1)?.type).toBe('generation-finish');
    expect(frames.some((frame) => frame.type === 'generation-chunk')).toBe(
      true,
    );
    expect(
      frames
        .filter((frame) => frame.type === 'generation-chunk')
        .map((frame) => frame.chunk.choices[0].delta.content ?? '')
        .join(''),
    ).toBe('Hello from aimock.');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
