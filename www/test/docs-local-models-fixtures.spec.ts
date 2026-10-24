import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import {
  assertLocalRecordingAllowed,
  createLocalModelInitScript,
  installLocalModelShim,
  selectLocalModelModes,
} from '../src/tools/docs-local-models-fixtures';

test('selects only the native local-model recording', () => {
  const modes = selectLocalModelModes(undefined);

  expect(modes).toEqual(['local-models']);
  expect(() => selectLocalModelModes('local-models,typo')).toThrow(
    'Unknown docs local model mode',
  );
});

test('installs a controllable native API without creating a session on installation', async () => {
  const runtime: Record<string, unknown> = {};

  installLocalModelShim(runtime);

  const fixture = runtime['__localModelFixture'] as { creates: number };
  const model = runtime['LanguageModel'] as { availability(): Promise<string> };
  expect(fixture.creates).toBe(0);
  expect(await model.availability()).toBe('available');
});

test('streams native text through a separately owned session and records destruction', async () => {
  const runtime: Record<string, unknown> = {};
  installLocalModelShim(runtime);
  const model = runtime['LanguageModel'] as {
    create(): Promise<{
      promptStreaming(
        messages: unknown,
        options: object,
      ): ReadableStream<string>;
      destroy(): void;
    }>;
  };

  const session = await model.create();
  const reader = session
    .promptStreaming([{ role: 'user', content: 'Three days in Lisbon.' }], {})
    .getReader();
  const chunk = await reader.read();
  session.destroy();

  expect(JSON.parse(chunk.value ?? '')).toEqual({
    destination: 'Lisbon',
    days: 3,
  });
  expect(runtime['__localModelFixture']).toMatchObject({
    creates: 1,
    destroys: 1,
    prompts: 1,
  });
});

test('rejects native local-model recording in continuous integration', () => {
  const record = () => assertLocalRecordingAllowed('true');

  expect(record).toThrow('Local model recording must run locally, never in CI');
  expect(() => assertLocalRecordingAllowed('1')).toThrow('never in CI');
});

test('allows a local native-model recording when CI is unset or explicitly false', () => {
  const local = () => assertLocalRecordingAllowed(undefined);

  expect(local).not.toThrow();
  expect(() => assertLocalRecordingAllowed('false')).not.toThrow();
  expect(() => assertLocalRecordingAllowed('0')).not.toThrow();
});

test('shadows a configurable native LanguageModel getter with the controlled shim', async () => {
  const runtime: Record<string, unknown> = {};
  Object.defineProperty(runtime, 'LanguageModel', {
    configurable: true,
    get: () => ({ availability: async () => 'downloadable' }),
  });

  installLocalModelShim(runtime);
  const fixture = runtime['__localModelFixture'] as { availability: string };
  fixture.availability = 'unavailable';
  const model = runtime['LanguageModel'] as { availability(): Promise<string> };

  expect(await model.availability()).toBe('unavailable');
});

test('runs serialized keepNames fixtures in an isolated browser realm', async () => {
  const runtime: Record<string, unknown> = {};
  const serialized = `function install() {
    globalThis.LanguageModel = { availability: __name(async () => 'available', 'availability') };
  }`;

  runInNewContext(createLocalModelInitScript(serialized), runtime);
  const model = runtime['LanguageModel'] as { availability(): Promise<string> };

  expect(await model.availability()).toBe('available');
});
