import { expect, test } from 'vitest';
import { installWorkbenchLocalFixture } from '../src/tools/workbench-local-fixture';

test('native API fixture returns labelled plan data through its stream and tracks actual disposal', async () => {
  const runtime: Record<string, unknown> = {};
  installWorkbenchLocalFixture(runtime);
  const model = runtime['LanguageModel'] as {
    create(): Promise<{
      promptStreaming(
        messages: unknown,
        options: unknown,
      ): ReadableStream<string>;
      destroy(): void;
    }>;
  };
  const session = await model.create();

  let text = '';
  for await (const chunk of session.promptStreaming(
    [{ role: 'user', content: 'Create a plan' }],
    {},
  ))
    text += chunk;
  session.destroy();

  expect(JSON.parse(text).steps).toHaveLength(2);
  expect(runtime['__workbenchLocalFixture']).toMatchObject({
    creates: 1,
    prompts: 1,
    destroys: 1,
  });
});
